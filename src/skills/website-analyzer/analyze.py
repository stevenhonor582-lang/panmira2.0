#!/usr/bin/env python3
"""
Website Analysis Engine — fetches a URL and produces a comprehensive evaluation JSON.
Usage: python3 analyze.py <url> [--mode quick|standard|deep]

Output: structured JSON report with SEO, content, technical, and structure analysis.
"""
import sys, json, re, time, ssl, socket
from urllib.parse import urlparse, urljoin
from collections import Counter

# ── Umami traffic integration ──
try:
    from traffic_analyzer import analyze_traffic
except ImportError:
    analyze_traffic = None  # type: ignore
from datetime import datetime

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}
TIMEOUT = 20
MAX_DEEP_PAGES = 20


def safe_request(url, **kw):
    try:
        return requests.get(url, headers=HEADERS, timeout=kw.pop("timeout", TIMEOUT), **kw)
    except requests.exceptions.SSLError:
        return {"error": "SSL证书无效或过期", "type": "ssl"}
    except requests.exceptions.ConnectionError:
        return {"error": "无法连接到服务器", "type": "connection"}
    except requests.exceptions.Timeout:
        return {"error": f"请求超时 (>{TIMEOUT}s)", "type": "timeout"}
    except requests.exceptions.TooManyRedirects:
        return {"error": "重定向次数过多", "type": "redirect"}
    except Exception as e:
        return {"error": str(e), "type": "unknown"}


def is_html(resp):
    ct = resp.headers.get("Content-Type", "")
    return "text/html" in ct or resp.text.strip().startswith("<")


def clean_text(text):
    return re.sub(r"\s+", " ", text).strip()


# ── Category 1: Basic Info ──

def analyze_basic(url, resp, soup, elapsed_ms):
    parsed = urlparse(url)
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    meta_desc = ""
    md = soup.find("meta", attrs={"name": "description"})
    if md and md.get("content"):
        meta_desc = md["content"].strip()

    scripts = len(soup.find_all("script"))
    styles = len(soup.find_all("link", rel="stylesheet"))
    images = len(soup.find_all("img"))
    html_size = len(resp.text)

    ssl_info = {"valid": parsed.scheme == "https", "issuer": ""}
    if ssl_info["valid"]:
        try:
            hostname = parsed.hostname
            ctx = ssl.create_default_context()
            with socket.create_connection((hostname, 443), timeout=5) as sock:
                with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    issuer = dict(x[0] for x in cert.get("issuer", []))
                    ssl_info["issuer"] = issuer.get("organizationName", "")
                    ssl_info["expires"] = cert.get("notAfter", "")
        except Exception:
            ssl_info["valid"] = False

    return {
        "url": url,
        "domain": parsed.netloc,
        "title": title,
        "title_length": len(title),
        "meta_description": meta_desc,
        "status_code": resp.status_code,
        "load_time_ms": round(elapsed_ms),
        "html_size_kb": round(html_size / 1024, 1),
        "resources": {"scripts": scripts, "stylesheets": styles, "images": images},
        "server": resp.headers.get("Server", "unknown"),
        "ssl": ssl_info,
    }


# ── Category 2: SEO ──

def analyze_seo(url, resp, soup):
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    findings = []
    score = 100

    title_tag = soup.find("title")
    title = title_tag.string.strip() if title_tag and title_tag.string else ""
    if not title:
        findings.append({"severity": "critical", "item": "title", "msg": "缺少 title 标签"})
    elif len(title) < 10:
        findings.append({"severity": "warning", "item": "title", "msg": f"Title 过短 ({len(title)}字)，建议 30-60 字符"})
    elif len(title) > 70:
        findings.append({"severity": "info", "item": "title", "msg": f"Title 过长 ({len(title)}字)，搜索结果可能被截断"})

    meta_desc = soup.find("meta", attrs={"name": "description"})
    desc_content = meta_desc.get("content", "") if meta_desc else ""
    if not desc_content:
        findings.append({"severity": "warning", "item": "meta_description", "msg": "缺少 meta description"})

    meta_kw = soup.find("meta", attrs={"name": "keywords"})
    kw_content = meta_kw.get("content", "") if meta_kw else ""

    canonical = soup.find("link", rel="canonical")

    og_tags = {}
    for tag in soup.find_all("meta"):
        prop = tag.get("property", "")
        if prop.startswith("og:"):
            og_tags[prop] = tag.get("content", "")
    if not og_tags:
        findings.append({"severity": "warning", "item": "og_tags", "msg": "缺少 Open Graph 标签，社交媒体分享效果差"})

    headings = {}
    for level in range(1, 7):
        tags = soup.find_all(f"h{level}")
        headings[f"h{level}"] = {"count": len(tags), "texts": [clean_text(t.get_text()) for t in tags[:5]]}

    if headings["h1"]["count"] == 0:
        findings.append({"severity": "critical", "item": "h1", "msg": "缺少 H1 标签"})
    elif headings["h1"]["count"] > 1:
        findings.append({"severity": "warning", "item": "h1", "msg": f"多个 H1 标签 ({headings['h1']['count']}个)，应只保留一个"})

    robots_txt = {"exists": False, "has_sitemap": False}
    try:
        r = requests.get(f"{base}/robots.txt", headers=HEADERS, timeout=10)
        if r.status_code == 200:
            robots_txt["exists"] = True
            robots_txt["has_sitemap"] = "sitemap" in r.text.lower()
    except Exception:
        pass

    if not robots_txt["exists"]:
        findings.append({"severity": "info", "item": "robots_txt", "msg": "未找到 robots.txt"})

    sitemap = {"exists": False, "total_urls": 0}
    for sitemap_url in [f"{base}/sitemap.xml", f"{base}/sitemap_index.xml"]:
        try:
            r = requests.get(sitemap_url, headers=HEADERS, timeout=10)
            if r.status_code == 200:
                sitemap["exists"] = True
                sitemap["total_urls"] = len(re.findall(r"<loc>(.*?)</loc>", r.text))
                break
        except Exception:
            continue

    if not sitemap["exists"]:
        findings.append({"severity": "warning", "item": "sitemap", "msg": "未找到 sitemap.xml"})

    schemas = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            schemas.append(json.loads(script.string))
        except Exception:
            pass
    if not schemas:
        findings.append({"severity": "info", "item": "structured_data", "msg": "未检测到结构化数据 (Schema.org)"})

    url_path = parsed.path
    url_issues = []
    if re.search(r"[A-Z]", url_path): url_issues.append("URL 包含大写字母")
    if len(url_path) > 100: url_issues.append(f"URL 过长 ({len(url_path)}字符)")

    for f in findings:
        if f["severity"] == "critical": score -= 15
        elif f["severity"] == "warning": score -= 8
        elif f["severity"] == "info": score -= 3

    return {
        "score": max(0, min(100, score)),
        "findings": findings,
        "title": title,
        "title_length": len(title),
        "meta_description": desc_content,
        "meta_keywords": kw_content,
        "canonical_url": canonical.get("href", "") if canonical else "",
        "og_tags": og_tags,
        "headings": headings,
        "robots_txt": robots_txt,
        "sitemap": sitemap,
        "structured_data_count": len(schemas),
        "url_structure_issues": url_issues,
    }


# ── Category 3: Content ──

def analyze_content(soup):
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator=" ")
    text = clean_text(text)
    words = text.split()
    word_count = len(words)
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))

    is_chinese = chinese_chars > word_count * 0.3
    keywords = []
    if is_chinese:
        phrases = re.findall(r"[\u4e00-\u9fff]{2,4}", text)
        keyword_freq = Counter(phrases).most_common(20)
        keywords = [{"phrase": k, "count": v} for k, v in keyword_freq if len(k) >= 2 and v >= 2]
    else:
        word_freq = Counter(w.lower() for w in words if len(w) > 3).most_common(20)
        keywords = [{"phrase": k, "count": v} for k, v in word_freq]

    images = soup.find_all("img")
    img_total = len(images)
    img_with_alt = sum(1 for img in images if img.get("alt", "").strip())
    img_without_alt = img_total - img_with_alt

    links = soup.find_all("a", href=True)
    internal_links = 0
    external_links = 0
    for link in links:
        href = link["href"]
        if href.startswith("http"):
            external_links += 1
        elif not href.startswith("#") and not href.startswith("javascript"):
            internal_links += 1

    score = 100
    findings = []
    total_chars = word_count + chinese_chars
    if total_chars < 100:
        score -= 40
        findings.append({"severity": "critical", "item": "content_length", "msg": f"页面内容过少 (约{total_chars}字符)"})
    elif total_chars < 300:
        score -= 20
        findings.append({"severity": "warning", "item": "content_length", "msg": f"内容偏少 (约{total_chars}字符)，建议 >300"})

    if img_total > 0 and img_without_alt > img_total * 0.5:
        score -= 15
        findings.append({"severity": "warning", "item": "alt_text", "msg": f"{img_without_alt}/{img_total} 张图片缺少 alt 文本"})

    return {
        "score": max(0, min(100, score)),
        "findings": findings,
        "total_chars": total_chars,
        "word_count": word_count,
        "chinese_chars": chinese_chars,
        "is_chinese_content": is_chinese,
        "top_keywords": keywords,
        "images": {"total": img_total, "with_alt": img_with_alt, "missing_alt": img_without_alt},
        "links": {"internal": internal_links, "external": external_links},
    }


# ── Category 4: Technical ──

def analyze_technical(url, resp):
    parsed = urlparse(url)
    findings = []
    score = 100

    security_headers = {
        "Strict-Transport-Security": resp.headers.get("Strict-Transport-Security", ""),
        "X-Frame-Options": resp.headers.get("X-Frame-Options", ""),
        "X-Content-Type-Options": resp.headers.get("X-Content-Type-Options", ""),
        "Content-Security-Policy": resp.headers.get("Content-Security-Policy", ""),
        "Referrer-Policy": resp.headers.get("Referrer-Policy", ""),
    }

    missing = [k for k, v in security_headers.items() if not v]
    if missing:
        score -= min(len(missing) * 10, 40)
        findings.append({"severity": "warning", "item": "security_headers", "msg": f"缺少安全头: {', '.join(missing)}"})

    if parsed.scheme == "http":
        findings.append({"severity": "critical", "item": "https", "msg": "未启用 HTTPS"})
        score -= 30

    soup_tech = BeautifulSoup(resp.text, "html.parser")
    viewport = soup_tech.find("meta", attrs={"name": "viewport"})
    if not viewport:
        findings.append({"severity": "critical", "item": "mobile", "msg": "缺少 viewport meta 标签，移动端适配可能有问题"})
        score -= 30

    favicon = soup_tech.find("link", rel=lambda r: r and "icon" in r)

    html = resp.text.lower()
    tech_hints = []
    tech_patterns = {
        "WordPress": ["wp-content", "wp-includes"],
        "React": ["__REACT_DEVTOOLS_GLOBAL_HOOK__", "react-dom"],
        "Vue.js": ["vue.js", "v-bind=", "v-if="],
        "jQuery": ["jquery"],
        "Bootstrap": ["bootstrap"],
        "Tailwind": ["tailwindcss"],
        "Google Analytics": ["google-analytics", "gtag", "ga.js"],
        "Google Tag Manager": ["googletagmanager"],
    }
    for tech, patterns in tech_patterns.items():
        if any(p in html for p in patterns):
            tech_hints.append(tech)
    if "nginx" in resp.headers.get("Server", "").lower():
        tech_hints.append("Nginx")

    html_size_kb = len(resp.text) / 1024
    if html_size_kb > 500:
        findings.append({"severity": "warning", "item": "page_size", "msg": f"HTML 过大 ({html_size_kb:.0f}KB)，影响加载速度"})

    return {
        "score": max(0, min(100, score)),
        "findings": findings,
        "security_headers": security_headers,
        "has_viewport": bool(viewport),
        "has_favicon": bool(favicon),
        "tech_hints": tech_hints,
        "page_size_kb": round(html_size_kb, 1),
    }


# ── Deep crawl ──

def crawl_internal_pages(base_url, soup, max_pages=MAX_DEEP_PAGES):
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    visited = set()
    pages_data = []
    internal_urls = set()

    for link in soup.find_all("a", href=True):
        href = link["href"]
        full = urljoin(base, href)
        if urlparse(full).netloc == parsed.netloc and full not in visited:
            internal_urls.add(full)

    internal_urls = list(internal_urls)[:max_pages]

    for page_url in internal_urls:
        if len(visited) >= max_pages:
            break
        if page_url in visited:
            continue
        visited.add(page_url)
        try:
            r = requests.get(page_url, headers=HEADERS, timeout=15)
            if r.status_code == 200 and is_html(r):
                ps = BeautifulSoup(r.text, "html.parser")
                ptitle = ps.title.string.strip() if ps.title and ps.title.string else ""
                pages_data.append({
                    "url": page_url,
                    "title": ptitle,
                    "status": r.status_code,
                    "size_kb": round(len(r.text) / 1024, 1),
                })
        except Exception:
            pass

    return {"pages_crawled": len(pages_data), "pages": pages_data}


# ── Main ──

def generate_report(url, mode="quick", umami_client=None, umami_website_id=None):
    start = time.time()
    resp = safe_request(url)
    if isinstance(resp, dict):
        return {"error": resp["error"], "error_type": resp["type"], "url": url}

    elapsed = (time.time() - start) * 1000
    if not is_html(resp):
        return {"error": f"返回的不是 HTML 内容", "url": url}

    soup = BeautifulSoup(resp.text, "html.parser")

    report = {
        "report_meta": {
            "url": url,
            "analyzed_at": datetime.now().isoformat(),
            "mode": mode,
            "analyzer_version": "1.0.0",
        },
        "basic": analyze_basic(url, resp, soup, elapsed),
        "seo": analyze_seo(url, resp, soup),
        "content": analyze_content(soup),
        "technical": analyze_technical(url, resp),
    }


    if umami_client and umami_website_id:
        pages = report.get("crawl", {}).get("pages", [])
        traffic = analyze_traffic(umami_client, umami_website_id, url, pages_crawled=pages)
        report["traffic"] = traffic
    elif umami_client is not None:
        report["traffic"] = {"available": False, "error": "未配置 umami_website_id，请在 Umami 后台查看网站 ID"}

    if mode in ("standard", "deep"):
        report["crawl"] = crawl_internal_pages(url, soup,
            max_pages=MAX_DEEP_PAGES if mode == "standard" else MAX_DEEP_PAGES * 3)

    weights = {"seo": 0.30, "content": 0.25, "technical": 0.20, "basic": 0.10, "traffic": 0.15}
    overall = sum(report[cat].get("score", 50) * w for cat, w in weights.items() if cat in report)
    report["overall_score"] = round(overall)

    if overall >= 90: report["grade"] = "A"
    elif overall >= 75: report["grade"] = "B"
    elif overall >= 60: report["grade"] = "C"
    elif overall >= 40: report["grade"] = "D"
    else: report["grade"] = "F"

    all_findings = []
    for cat in ["seo", "content", "technical", "traffic"]:
        if cat in report:
            all_findings.extend(report[cat].get("findings", []))
    report["critical_issues"] = [f for f in all_findings if f["severity"] == "critical"]
    report["warning_issues"] = [f for f in all_findings if f["severity"] == "warning"]
    report["total_issues"] = len(all_findings)

    return report


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 analyze.py <url> [--mode quick|standard|deep] [--umami-url <url>] [--umami-user <user> --umami-pass <pass>] [--umami-site-id <id>]"}, ensure_ascii=False))
        sys.exit(1)

    target_url = sys.argv[1]
    mode = "quick"
    umami_url = None
    umami_user = None
    umami_pass = None
    umami_site_id = None

    for i, arg in enumerate(sys.argv):
        if arg == "--mode" and i + 1 < len(sys.argv):
            mode = sys.argv[i + 1]
        elif arg == "--umami-url" and i + 1 < len(sys.argv):
            umami_url = sys.argv[i + 1]
        elif arg == "--umami-user" and i + 1 < len(sys.argv):
            umami_user = sys.argv[i + 1]
        elif arg == "--umami-pass" and i + 1 < len(sys.argv):
            umami_pass = sys.argv[i + 1]
        elif arg == "--umami-site-id" and i + 1 < len(sys.argv):
            umami_site_id = sys.argv[i + 1]

    if not target_url.startswith("http"):
        target_url = "https://" + target_url

    umami_client = None
    if umami_url and umami_user and umami_pass:
        try:
            from umami_client import UmamiClient
            umami_client = UmamiClient(umami_url, username=umami_user, password=umami_pass)
        except Exception as e:
            umami_client = {"error": str(e), "type": "umami_connection"}

    report = generate_report(target_url, mode, umami_client=umami_client, umami_website_id=umami_site_id)
    print(json.dumps(report, ensure_ascii=False, indent=2))
