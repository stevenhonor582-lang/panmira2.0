#!/usr/bin/env python3
"""
Traffic-content feedback analysis — the 5th dimension for website evaluation.
Connects to Umami Analytics to pull real traffic data and correlate with
SEO/content scores to identify "traffic secrets" (流量密码).
"""
from datetime import datetime, timedelta

try:
    from umami_client import UmamiClient
except ImportError:
    from .umami_client import UmamiClient


def analyze_traffic(umami_client, website_id, domain, pages_crawled=None):
    """
    Analyze traffic data and produce feedback insights.
    Returns a traffic report dict, or an error dict if Umami is unavailable.
    """
    if isinstance(umami_client, dict) and umami_client.get("error"):
        return {"available": False, "error": umami_client["error"]}

    try:
        stats = umami_client.get_stats(website_id)
    except Exception as e:
        return {"available": False, "error": f"Stats fetch failed: {e}"}

    report = {"available": True, "stats": {}, "top_pages": [], "sources": [], "channel": [],
              "insights": [], "score": 70}

    # ── Overall stats ──
    try:
        report["stats"] = {
            "pageviews": int(stats.get("pageviews", 0)),
            "visitors": int(stats.get("visitors", 0)),
            "visits": int(stats.get("visits", 0)),
            "bounces": int(stats.get("bounces", 0)),
            "total_time_ms": int(stats.get("totaltime", 0)),
            "bounce_rate": round(stats.get("bounces", 0) / max(stats.get("visits", 1), 1) * 100, 1),
        }
    except Exception:
        pass

    # ── Top pages by traffic ──
    top_pages = []
    try:
        page_data = umami_client.get_pageview_metrics(website_id, limit=30)
        for item in page_data:
            top_pages.append({"url": item.get("x", ""), "views": int(item.get("y", 0))})
        report["top_pages"] = top_pages
    except Exception:
        pass

    # ── Traffic sources / referrers ──
    sources = []
    try:
        ref_data = umami_client.get_referrer_metrics(website_id, limit=20)
        for item in ref_data:
            sources.append({"source": item.get("x", ""), "count": int(item.get("y", 0))})
        report["sources"] = sources
    except Exception:
        pass

    # ── Channel breakdown ──
    channels = []
    try:
        ch_data = umami_client.get_channel_metrics(website_id)
        for item in ch_data:
            channels.append({"channel": item.get("x", ""), "count": int(item.get("y", 0))})
        report["channel"] = channels
    except Exception:
        pass

    # ── Intelligent insights ──
    insights = _generate_insights(report, domain, pages_crawled)
    report["insights"] = insights

    # ── Traffic health score ──
    score = _calculate_traffic_score(report)
    report["score"] = score

    return report


def _generate_insights(report, domain, pages_crawled):
    """Generate actionable insights from traffic data."""
    insights = []
    stats = report.get("stats", {})
    top_pages = report.get("top_pages", [])
    sources = report.get("sources", [])
    channels = report.get("channel", [])

    # 1) Overall traffic assessment
    pv = stats.get("pageviews", 0)
    visitors = stats.get("visitors", 0)
    if pv == 0 and visitors == 0:
        insights.append({
            "severity": "info",
            "category": "traffic_overview",
            "msg": "30天内无流量数据。网站可能新上线，或尚未部署 Umami 追踪代码。首先确认追踪脚本已嵌入。"
        })
        return insights

    insights.append({
        "severity": "info",
        "category": "traffic_overview",
        "msg": f"30天内: {pv} PV / {visitors} UV / {stats.get('visits', 0)} 会话 / 跳出率 {stats.get('bounce_rate', 0)}%"
    })

    # 2) Bounce rate assessment
    bounce = stats.get("bounce_rate", 0)
    if bounce > 80:
        insights.append({
            "severity": "critical",
            "category": "bounce_rate",
            "msg": f"跳出率 {bounce}% 过高。建议: 强化内链、优化首屏内容相关性、改进 CTA 引导"
        })
    elif bounce > 60:
        insights.append({
            "severity": "warning",
            "category": "bounce_rate",
            "msg": f"跳出率 {bounce}% 偏高，关注落地页内容与搜索意图的匹配度"
        })

    # 3) Traffic concentration (Pareto analysis)
    if len(top_pages) >= 5:
        total_views = sum(p["views"] for p in top_pages)
        top3_views = sum(p["views"] for p in top_pages[:3])
        top3_pct = round(top3_views / max(total_views, 1) * 100)
        if top3_pct > 80:
            insights.append({
                "severity": "warning",
                "category": "traffic_concentration",
                "msg": f"流量高度集中: 前3页占 {top3_pct}% 流量。内容策略过于依赖少数页面，抗风险能力弱。建议拓展长尾内容。"
            })
        else:
            insights.append({
                "severity": "info",
                "category": "traffic_concentration",
                "msg": f"流量分布较健康: 前3页仅占 {top3_pct}% 流量，长尾效应良好"
            })

    # 4) Traffic source diversity
    if len(sources) == 0:
        insights.append({
            "severity": "warning",
            "category": "traffic_source",
            "msg": "未检测到外部引荐来源。SEO 流量可能是主要渠道，建议建设外链和社交媒体引流。"
        })
    elif len(sources) == 1:
        insights.append({
            "severity": "warning",
            "category": "traffic_source",
            "msg": f"仅1个引荐来源 ({sources[0]['source']})，流量来源过于单一"
        })

    # 5) Channel mix
    channel_map = {c["channel"]: c["count"] for c in channels}
    total_ch = sum(c["count"] for c in channels)
    search_pct = round(channel_map.get("search", 0) / max(total_ch, 1) * 100)
    social_pct = round(channel_map.get("social", 0) / max(total_ch, 1) * 100)
    direct_pct = round(channel_map.get("direct", 0) / max(total_ch, 1) * 100)

    if search_pct > 80:
        insights.append({
            "severity": "warning",
            "category": "channel_mix",
            "msg": f"搜索渠道占比 {search_pct}%，过度依赖搜索引擎。建议加强社交媒体 ({social_pct}%) 和直接访问 ({direct_pct}%) 渠道建设"
        })

    # 6) Traffic-content correlation (if pages_crawled available)
    if pages_crawled and top_pages:
        crawled_urls = {p.get("url", ""): p for p in pages_crawled}
        traffic_urls = {p["url"]: p["views"] for p in top_pages}
        high_traffic_not_crawled = []
        for tp in top_pages[:10]:
            url = tp["url"]
            if url not in crawled_urls and not url.startswith("http"):
                high_traffic_not_crawled.append(url)
        if high_traffic_not_crawled:
            insights.append({
                "severity": "info",
                "category": "content_gap",
                "msg": f"发现 {len(high_traffic_not_crawled)} 个高流量页面未在爬取范围内，可能是登录/支付/功能页"
            })

    # 7) Engagement check
    total_time = stats.get("total_time_ms", 0)
    visits = max(stats.get("visits", 1), 1)
    avg_time_sec = total_time / visits / 1000
    if avg_time_sec < 15 and pv > 0:
        insights.append({
            "severity": "warning",
            "category": "engagement",
            "msg": f"平均会话时长仅 {avg_time_sec:.0f} 秒，用户停留时间过短。内容可能未满足搜索意图，或页面加载太慢。"
        })

    return insights


def _calculate_traffic_score(report):
    """Score traffic health from 0-100."""
    score = 100
    stats = report.get("stats", {})
    insights = report.get("insights", [])

    bounce = stats.get("bounce_rate", 0)
    if bounce > 90: score -= 30
    elif bounce > 80: score -= 20
    elif bounce > 60: score -= 10

    pv = stats.get("pageviews", 0)
    if pv == 0: score -= 20
    elif pv < 100: score -= 10

    sources = report.get("sources", [])
    if len(sources) == 0: score -= 10
    elif len(sources) == 1: score -= 5

    for ins in insights:
        if ins["severity"] == "critical": score -= 10
        elif ins["severity"] == "warning": score -= 5

