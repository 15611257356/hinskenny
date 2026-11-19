#!/usr/bin/env python3
"""HinsKenny Studio local-only content server.

Run from the repository root:
    python3 studio/server.py

Then open:
    http://127.0.0.1:8765/studio/
"""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import mimetypes
import os
import re
import shutil
import sys
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


STUDIO_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = STUDIO_DIR.parent
CONTENT_DIR = STUDIO_DIR / "content"
SITE_FILE = CONTENT_DIR / "site.json"
CREDITS_FILE = CONTENT_DIR / "credits.json"
ASSETS_FILE = CONTENT_DIR / "assets.json"
IMAGES_DIR = PROJECT_ROOT / "images"
BACKUP_DIR = STUDIO_DIR / "backups"

MAX_JSON_BYTES = 20 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

COLLECTION_LABELS = {
    "music": "音乐",
    "people": "人物",
    "timeline": "时间线",
    "sugars": "糖点",
    "photos": "相册",
    "sources": "来源",
    "credits": "版权",
}

REQUIRED_FIELDS = {
    "music": ["id", "label", "note", "source"],
    "people": ["id", "name", "en", "photo", "intro"],
    "timeline": ["id", "year", "title", "text"],
    "sugars": ["id", "title", "tag", "story", "video", "cover", "by"],
    "photos": ["id", "src", "caption"],
    "sources": ["id", "label", "url"],
    "credits": ["id", "file", "title", "author", "license", "source"],
}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(temporary, path)


def get_path(item: dict[str, Any], path: str) -> Any:
    value: Any = item
    for key in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def clean_for_publish(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: clean_for_publish(child)
            for key, child in value.items()
            if key != "_status" and child not in (None, "")
        }
    if isinstance(value, list):
        return [clean_for_publish(child) for child in value]
    return value


def is_published(item: dict[str, Any]) -> bool:
    return item.get("_status", "published") == "published"


def public_payload(site: dict[str, Any], credits: list[dict[str, Any]], include_drafts: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    public_site: dict[str, Any] = {}
    for collection, items in site.items():
        if not isinstance(items, list):
            public_site[collection] = clean_for_publish(items)
            continue
        selected = items if include_drafts else [item for item in items if is_published(item)]
        public_site[collection] = clean_for_publish(selected)
    selected_credits = credits if include_drafts else [item for item in credits if is_published(item)]
    return public_site, clean_for_publish(selected_credits)


def js_assignment(name: str, value: Any, comment: str) -> str:
    encoded = json.dumps(value, ensure_ascii=False, indent=2)
    return f"// {comment}\n{name} = {encoded};\n"


def human_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.0f} KB"
    return f"{size / 1024 / 1024:.1f} MB"


def build_usage_map(site: dict[str, Any], credits: list[dict[str, Any]]) -> dict[str, list[str]]:
    usage: dict[str, list[str]] = {}

    def add(path: str | None, label: str) -> None:
        if not path:
            return
        usage.setdefault(path, [])
        if label not in usage[path]:
            usage[path].append(label)

    for item in site.get("people", []):
        add(item.get("photo"), f"人物：{item.get('name', item.get('id', '未命名'))}")
    for item in site.get("timeline", []):
        add(item.get("photo"), f"时间线：{item.get('title', item.get('id', '未命名'))}")
        add(item.get("cover"), f"时间线封面：{item.get('title', item.get('id', '未命名'))}")
    for item in site.get("sugars", []):
        add(item.get("cover"), f"糖点：{item.get('title', item.get('id', '未命名'))}")
    for item in site.get("photos", []):
        add(item.get("src"), f"相册：{item.get('caption', item.get('id', '未命名'))}")
    for item in credits:
        add(item.get("file"), f"版权：{item.get('title', item.get('id', '未命名'))}")
    return usage


def build_file_assets() -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    if IMAGES_DIR.exists():
        for file_path in sorted(IMAGES_DIR.iterdir(), key=lambda path: path.name.lower()):
            if not file_path.is_file() or file_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
                continue
            relative = file_path.relative_to(PROJECT_ROOT).as_posix()
            assets.append({
                "id": f"local:{relative}",
                "label": file_path.name,
                "path": relative,
                "kind": "本地图片",
                "provider": "GitHub",
                "sizeLabel": human_size(file_path.stat().st_size),
            })
    return assets


def validate_content(site: Any, credits: Any, assets: Any) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    checked = 0

    def issue(level: str, location: str, message: str) -> None:
        issues.append({"level": level, "location": location, "message": message})

    if not isinstance(site, dict):
        return {"checked": 0, "issues": [{"level": "error", "location": "站点数据", "message": "site 必须是对象。"}]}
    if not isinstance(credits, list):
        return {"checked": 0, "issues": [{"level": "error", "location": "版权数据", "message": "credits 必须是数组。"}]}
    if not isinstance(assets, list):
        return {"checked": 0, "issues": [{"level": "error", "location": "素材库", "message": "assets 必须是数组。"}]}

    all_ids: dict[str, str] = {}
    registered_urls: set[str] = set()
    for index, asset in enumerate(assets):
        checked += 1
        if not isinstance(asset, dict):
            issue("error", f"素材库 #{index + 1}", "素材必须是对象。")
            continue
        location = f"素材库 · {asset.get('name') or asset.get('id') or '未命名'}"
        asset_id = asset.get("id")
        if not isinstance(asset_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", asset_id):
            issue("error", location, "素材 ID 只能包含小写英文、数字和连字符。")
        elif asset_id in all_ids:
            issue("error", location, f"唯一 ID 与“{all_ids[asset_id]}”重复：{asset_id}。")
        else:
            all_ids[asset_id] = location
        if not str(asset.get("name", "")).strip():
            issue("error", location, "缺少素材名称。")
        if not str(asset.get("provider", "")).strip():
            issue("error", location, "缺少图床服务商。")
        url = asset.get("url")
        if not isinstance(url, str) or not re.fullmatch(r"https://[^\s\"'<>`]+", url, re.IGNORECASE):
            issue("error", location, "图片需要有效的 HTTPS 地址。")
        elif url in registered_urls:
            issue("error", location, "图片地址重复登记。")
        else:
            registered_urls.add(url)
        if asset.get("status", "active") not in {"active", "archived"}:
            issue("error", location, "素材状态无效。")
    collections: list[tuple[str, list[Any]]] = []
    for name in ("music", "people", "timeline", "sugars", "photos", "sources"):
        items = site.get(name)
        if not isinstance(items, list):
            issue("error", COLLECTION_LABELS[name], "该板块必须是数组。")
            continue
        collections.append((name, items))
    collections.append(("credits", credits))

    for name, items in collections:
        label = COLLECTION_LABELS[name]
        for index, item in enumerate(items):
            checked += 1
            location = f"{label} #{index + 1}"
            if not isinstance(item, dict):
                issue("error", location, "条目必须是对象。")
                continue
            status = item.get("_status", "published")
            title = item.get("title") or item.get("label") or item.get("name") or item.get("caption") or item.get("id") or "未命名"
            location = f"{label} · {title}"
            if status == "archived":
                continue
            missing = [field for field in REQUIRED_FIELDS[name] if not get_path(item, field)]
            for field in missing:
                level = "error" if status == "published" else "warning"
                issue(level, location, f"缺少必填字段：{field}。")

            item_id = item.get("id")
            if item_id:
                if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", str(item_id)):
                    issue("error" if status == "published" else "warning", location, "唯一 ID 只能包含小写英文、数字和连字符。")
                elif item_id in all_ids:
                    issue("error", location, f"唯一 ID 与“{all_ids[item_id]}”重复：{item_id}。")
                else:
                    all_ids[item_id] = location

            for key, value in item.items():
                if (key.lower().endswith("url") or key in {"source"}) and isinstance(value, str) and value and not value.startswith(("http://", "https://")):
                    issue("error" if status == "published" else "warning", location, f"{key} 需要是 http:// 或 https:// 链接。")

    credit_ids = {item.get("id") for item in credits if isinstance(item, dict)}
    for item in site.get("photos", []):
        if not isinstance(item, dict) or item.get("_status", "published") == "archived":
            continue
        if item.get("creditId") and item.get("creditId") not in credit_ids:
            issue("error" if is_published(item) else "warning", f"相册 · {item.get('caption', item.get('id', '未命名'))}", f"找不到版权记录：{item.get('creditId')}。")

    image_values: list[tuple[str, dict[str, Any], str]] = []
    for name, field in (("people", "photo"), ("timeline", "photo"), ("timeline", "cover"), ("sugars", "cover"), ("photos", "src")):
        for item in site.get(name, []):
            if isinstance(item, dict) and item.get(field):
                image_values.append((name, item, field))
    for item in credits:
        if isinstance(item, dict) and item.get("file"):
            image_values.append(("credits", item, "file"))

    for name, item, field in image_values:
        media = item.get(field)
        if not isinstance(media, str):
            continue
        title = item.get("title") or item.get("name") or item.get("caption") or item.get("id", "未命名")
        location = f"{COLLECTION_LABELS[name]} · {title}"
        if media.startswith(("http://", "https://")):
            if not re.fullmatch(r"https://[^\s\"'<>`]+", media, re.IGNORECASE):
                issue("error" if is_published(item) else "warning", location, "图片需要有效的 HTTPS 地址。")
            elif media not in registered_urls:
                issue("warning", location, "图片外链尚未登记到素材库。")

    for name, item, field in image_values:
        if not is_published(item):
            continue
        media = item.get(field)
        if media and isinstance(media, str) and not media.startswith(("http://", "https://")):
            file_path = (PROJECT_ROOT / media).resolve()
            title = item.get("title") or item.get("name") or item.get("caption") or item.get("id", "未命名")
            try:
                file_path.relative_to(PROJECT_ROOT)
            except ValueError:
                issue("error", f"{COLLECTION_LABELS[name]} · {title}", "图片路径超出项目目录。")
                continue
            if not file_path.is_file():
                issue("error", f"{COLLECTION_LABELS[name]} · {title}", f"找不到图片文件：{media}。")

    for item in site.get("timeline", []):
        if is_published(item) and not get_path(item, "source.url"):
            issue("warning", f"时间线 · {item.get('title', item.get('id', '未命名'))}", "尚未填写可核验的原始出处。")
        video = item.get("video")
        if video and not re.fullmatch(r"BV[0-9A-Za-z]+", str(video)):
            issue("error" if is_published(item) else "warning", f"时间线 · {item.get('title', item.get('id', '未命名'))}", "B 站视频号格式不正确。")

    for item in site.get("sugars", []):
        video = item.get("video")
        if video and not re.fullmatch(r"BV[0-9A-Za-z]+", str(video)):
            issue("error" if is_published(item) else "warning", f"糖点 · {item.get('title', item.get('id', '未命名'))}", "B 站视频号格式不正确。")

    for item in site.get("music", []):
        if is_published(item) and bool(item.get("bv")) == bool(item.get("youtube")):
            issue("error", f"音乐 · {item.get('label', item.get('id', '未命名'))}", "B 站 BV 号和 YouTube ID 必须且只能填写一个。")

    return {"checked": checked, "issues": issues}


def ensure_payload(payload: Any) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    if not isinstance(payload, dict):
        raise ValueError("请求内容必须是对象。")
    site = payload.get("site")
    credits = payload.get("credits")
    assets = payload.get("assets")
    if not isinstance(site, dict) or not isinstance(credits, list) or not isinstance(assets, list):
        raise ValueError("请求必须包含 site 对象、credits 数组和 assets 数组。")
    return site, credits, assets


class StudioHandler(SimpleHTTPRequestHandler):
    server_version = "HinsKennyStudio/1.0"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def log_message(self, format_string: str, *args: Any) -> None:
        sys.stdout.write(f"[{self.log_date_time_string()}] {format_string % args}\n")

    def send_json(self, payload: Any, status: int = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def send_text(self, content: str, content_type: str, status: int = HTTPStatus.OK) -> None:
        encoded = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def read_json_body(self) -> Any:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("请求内容为空。")
        if length > MAX_JSON_BYTES:
            raise ValueError("请求内容超过 20 MB。")
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("请求不是有效的 UTF-8 JSON。") from error

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/state":
                site = load_json(SITE_FILE)
                credits = load_json(CREDITS_FILE)
                assets = load_json(ASSETS_FILE)
                self.send_json({"site": site, "credits": credits, "catalog": assets, "files": build_file_assets()})
                return
            if parsed.path == "/api/assets":
                self.send_json({"files": build_file_assets()})
                return
            if parsed.path in {"/api/preview-data.js", "/api/preview-credits.js"}:
                site = load_json(SITE_FILE)
                credits = load_json(CREDITS_FILE)
                public_site, public_credits = public_payload(site, credits, include_drafts=True)
                if parsed.path.endswith("preview-data.js"):
                    content = js_assignment("window.SITE", public_site, "HinsKenny Studio 草稿预览数据。")
                else:
                    content = js_assignment("window.CREDITS", public_credits, "HinsKenny Studio 草稿预览版权数据。")
                self.send_text(content, "text/javascript; charset=utf-8")
                return
            if parsed.path in {"/", "/index.html"} and parse_qs(parsed.query).get("studioPreview") == ["1"]:
                html = (PROJECT_ROOT / "index.html").read_text(encoding="utf-8")
                html = html.replace('<script src="data.js"></script>', '<script src="/api/preview-data.js"></script>')
                html = html.replace('<script src="credits.js"></script>', '<script src="/api/preview-credits.js"></script>')
                self.send_text(html, "text/html; charset=utf-8")
                return
        except (OSError, ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            payload = self.read_json_body()
            if parsed.path == "/api/save":
                site, credits, assets = ensure_payload(payload)
                atomic_write_json(SITE_FILE, site)
                atomic_write_json(CREDITS_FILE, credits)
                atomic_write_json(ASSETS_FILE, assets)
                self.send_json({"ok": True, "files": build_file_assets()})
                return
            if parsed.path == "/api/validate":
                site, credits, assets = ensure_payload(payload)
                self.send_json(validate_content(site, credits, assets))
                return
            if parsed.path == "/api/publish":
                site, credits, assets = ensure_payload(payload)
                validation = validate_content(site, credits, assets)
                errors = [issue for issue in validation["issues"] if issue["level"] == "error"]
                if errors:
                    self.send_json({"error": "内容仍有校验错误，无法发布。", "validation": validation}, HTTPStatus.BAD_REQUEST)
                    return
                atomic_write_json(SITE_FILE, site)
                atomic_write_json(CREDITS_FILE, credits)
                atomic_write_json(ASSETS_FILE, assets)
                timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                BACKUP_DIR.mkdir(parents=True, exist_ok=True)
                for name in ("data.js", "credits.js"):
                    source = PROJECT_ROOT / name
                    if source.exists():
                        shutil.copy2(source, BACKUP_DIR / f"{timestamp}-{name}")
                public_site, public_credits = public_payload(site, credits, include_drafts=False)
                (PROJECT_ROOT / "data.js").write_text(
                    js_assignment("window.SITE", public_site, "由 studio/content/site.json 自动生成，请在内容工作台中编辑。"),
                    encoding="utf-8",
                )
                (PROJECT_ROOT / "credits.js").write_text(
                    js_assignment("window.CREDITS", public_credits, "由 studio/content/credits.json 自动生成，请在内容工作台中编辑。"),
                    encoding="utf-8",
                )
                published_items = sum(len(items) for items in public_site.values() if isinstance(items, list)) + len(public_credits)
                self.send_json({"ok": True, "publishedItems": published_items, "backup": timestamp})
                return
            if parsed.path == "/api/upload":
                result = self.handle_upload(payload)
                self.send_json(result, HTTPStatus.CREATED)
                return
            self.send_json({"error": "未知接口。"}, HTTPStatus.NOT_FOUND)
        except ValueError as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except (OSError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_upload(self, payload: Any) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("上传请求格式不正确。")
        file_name = str(payload.get("fileName", ""))
        data_url = str(payload.get("dataUrl", ""))
        match = re.fullmatch(r"data:([^;]+);base64,(.+)", data_url, re.DOTALL)
        if not match:
            raise ValueError("图片数据格式不正确。")
        mime_type, encoded = match.groups()
        if mime_type not in ALLOWED_IMAGE_TYPES:
            raise ValueError("仅支持 JPEG、PNG、WebP 和 GIF。")
        try:
            content = base64.b64decode(encoded, validate=True)
        except binascii.Error as error:
            raise ValueError("图片 Base64 数据损坏。") from error
        if not content or len(content) > MAX_IMAGE_BYTES:
            raise ValueError("图片为空或超过 10 MB。")

        stem = re.sub(r"[^a-zA-Z0-9-]+", "-", Path(file_name).stem).strip("-").lower()
        if not stem:
            stem = f"asset-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        extension = ALLOWED_IMAGE_TYPES[mime_type]
        candidate = IMAGES_DIR / f"{stem}{extension}"
        suffix = 2
        while candidate.exists():
            candidate = IMAGES_DIR / f"{stem}-{suffix}{extension}"
            suffix += 1
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        candidate.write_bytes(content)
        relative = candidate.relative_to(PROJECT_ROOT).as_posix()
        site = load_json(SITE_FILE)
        credits = load_json(CREDITS_FILE)
        return {"ok": True, "path": relative, "files": build_file_assets()}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local HinsKenny content studio.")
    parser.add_argument("--port", type=int, default=8765, help="Local port (default: 8765)")
    return parser.parse_args()


def main() -> None:
    args = parse_arguments()
    if not SITE_FILE.is_file() or not CREDITS_FILE.is_file() or not ASSETS_FILE.is_file():
        raise SystemExit("Missing studio content JSON files")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), StudioHandler)
    print(f"HinsKenny Studio: http://127.0.0.1:{args.port}/studio/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
