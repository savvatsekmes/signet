use crate::state::AppState;
use crate::vault::format;
use crate::vault::manifest::DocumentEntry;
use printpdf::{BuiltinFont, IndirectFontRef, Mm, PdfDocument, PdfDocumentReference, PdfLayerReference};
use std::fs::File;
use std::io::BufWriter;
use tauri::State;

fn require_path_and_key(state: &AppState) -> Result<(String, [u8; 32]), String> {
    let path = state
        .vault_path
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .ok_or("Vault is not unlocked")?;
    let key = state
        .key
        .lock()
        .map_err(|_| "State lock poisoned")?
        .ok_or("Vault is not unlocked")?;
    Ok((path, key))
}

#[derive(serde::Serialize, Clone)]
pub struct DocumentMeta {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub section: String,
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
}

fn snippet_from_html(html: &str, max_chars: usize) -> String {
    // Strip simple tags + collapse whitespace. Doesn't need to be perfect — just
    // enough for a list preview.
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            _ => out.push(c),
        }
    }
    let collapsed: String = out
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if collapsed.chars().count() > max_chars {
        collapsed.chars().take(max_chars).collect::<String>() + "…"
    } else {
        collapsed
    }
}

fn meta_from(entry: &DocumentEntry) -> DocumentMeta {
    DocumentMeta {
        id: entry.id.clone(),
        title: entry.title.clone(),
        snippet: snippet_from_html(&entry.content, 140),
        section: entry.section.clone(),
        kind: if entry.kind.is_empty() {
            "documents".to_string()
        } else {
            entry.kind.clone()
        },
        created_at: entry.created_at.clone(),
        updated_at: entry.updated_at.clone(),
    }
}

fn normalize_kind(k: Option<String>) -> String {
    match k {
        Some(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                "documents".to_string()
            } else {
                trimmed.to_string()
            }
        }
        None => "documents".to_string(),
    }
}

#[tauri::command]
pub async fn add_document(
    title: String,
    content: String,
    section: Option<String>,
    kind: Option<String>,
    state: State<'_, AppState>,
) -> Result<DocumentEntry, String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Title is required".to_string());
    }
    let now = chrono::Utc::now().to_rfc3339();
    let entry = DocumentEntry {
        id: uuid::Uuid::new_v4().to_string(),
        title: trimmed,
        content,
        section: section.map(|s| s.trim().to_string()).unwrap_or_default(),
        kind: normalize_kind(kind),
        created_at: now.clone(),
        updated_at: now,
    };
    let returned = entry.clone();
    let (path, key) = require_path_and_key(&state)?;
    {
        let mut manifest_lock =
            state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
        manifest.documents.push(entry);
        format::save_vault(&path, &key, manifest)?;
    }
    Ok(returned)
}

#[tauri::command]
pub async fn update_document(
    id: String,
    title: String,
    content: String,
    section: Option<String>,
    kind: Option<String>,
    state: State<'_, AppState>,
) -> Result<DocumentEntry, String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Title is required".to_string());
    }
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let target = manifest
        .documents
        .iter_mut()
        .find(|d| d.id == id)
        .ok_or("Document not found")?;
    target.title = trimmed;
    target.content = content;
    if let Some(s) = section {
        target.section = s.trim().to_string();
    }
    if let Some(k) = kind {
        let trimmed_k = k.trim();
        if !trimmed_k.is_empty() {
            target.kind = trimmed_k.to_string();
        }
    }
    target.updated_at = chrono::Utc::now().to_rfc3339();
    let returned = target.clone();
    format::save_vault(&path, &key, manifest)?;
    Ok(returned)
}

#[tauri::command]
pub async fn delete_document(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (path, key) = require_path_and_key(&state)?;
    let mut manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_mut().ok_or("Vault is not unlocked")?;
    let before = manifest.documents.len();
    manifest.documents.retain(|d| d.id != id);
    if manifest.documents.len() == before {
        return Err("Document not found".to_string());
    }
    format::save_vault(&path, &key, manifest)?;
    Ok(())
}

#[tauri::command]
pub async fn list_documents(
    kind: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<DocumentMeta>, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    let want = kind.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let mut list: Vec<DocumentMeta> = manifest
        .documents
        .iter()
        .filter(|d| match want {
            Some(k) => {
                let actual = if d.kind.is_empty() { "documents" } else { &d.kind };
                actual == k
            }
            None => true,
        })
        .map(meta_from)
        .collect();
    list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(list)
}

#[tauri::command]
pub async fn get_document(
    id: String,
    state: State<'_, AppState>,
) -> Result<DocumentEntry, String> {
    let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
    let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
    let entry = manifest
        .documents
        .iter()
        .find(|d| d.id == id)
        .ok_or("Document not found")?
        .clone();
    Ok(entry)
}

/// Export a document. The output format is chosen from the file extension of
/// `output_path`:
///   .html  → self-contained styled HTML
///   .md    → Markdown (preserves headings, bold/italic, lists, links)
///   .txt   → plain text (HTML stripped, whitespace collapsed)
/// Anything else falls back to HTML.
#[tauri::command]
pub async fn export_document(
    id: String,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let manifest_lock =
            state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
        manifest
            .documents
            .iter()
            .find(|d| d.id == id)
            .ok_or("Document not found")?
            .clone()
    };
    let ext = std::path::Path::new(&output_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext == "pdf" {
        render_pdf_export(&entry, &output_path)?;
        return Ok(());
    }
    let body = match ext.as_str() {
        "txt" => render_txt_export(&entry),
        "md" | "markdown" => render_md_export(&entry),
        _ => render_html_export(&entry),
    };
    std::fs::write(&output_path, body.as_bytes())
        .map_err(|e| format!("Failed to write document: {}", e))?;
    Ok(())
}

// Backwards-compatible alias — older frontend code still calls export_document_html.
#[tauri::command]
pub async fn export_document_html(
    id: String,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    export_document(id, output_path, state).await
}

fn render_html_export(entry: &DocumentEntry) -> String {
    let title = html_escape(&entry.title);
    let body = &entry.content;
    format!(
        "<!doctype html>\n\
<html lang=\"en\">\n\
<head>\n\
<meta charset=\"utf-8\" />\n\
<title>{title}</title>\n\
<style>\n\
  :root {{ color-scheme: light dark; }}\n\
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.6; color: #1a1a1a; background: #ffffff; }}\n\
  h1 {{ font-size: 26px; font-weight: 500; margin: 0 0 6px; letter-spacing: -0.4px; }}\n\
  .meta {{ font-size: 12px; color: #999990; margin-bottom: 24px; }}\n\
  hr {{ border: none; border-top: 0.5px solid rgba(0,0,0,0.1); margin: 24px 0; }}\n\
  h2 {{ font-size: 20px; font-weight: 500; margin: 24px 0 12px; }}\n\
  h3 {{ font-size: 16px; font-weight: 500; margin: 18px 0 10px; }}\n\
  p {{ margin: 0 0 12px; }}\n\
  ul, ol {{ margin: 0 0 12px 24px; padding: 0; }}\n\
  li {{ margin-bottom: 4px; }}\n\
  a {{ color: #8B1A1A; }}\n\
  @media (prefers-color-scheme: dark) {{ body {{ color: #f0ede8; background: #1a1917; }} hr {{ border-top-color: rgba(255,255,255,0.1); }} a {{ color: #c0392b; }} .meta {{ color: #6a6660; }} }}\n\
</style>\n\
</head>\n\
<body>\n\
  <h1>{title}</h1>\n\
  <div class=\"meta\">Exported from Signet · {date}</div>\n\
  <hr />\n\
  {body}\n\
</body>\n\
</html>\n",
        title = title,
        body = body,
        date = chrono::Utc::now().format("%Y-%m-%d")
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

/// Plain text export — strip every tag, collapse whitespace inside paragraphs,
/// keep block boundaries as blank lines.
fn render_txt_export(entry: &DocumentEntry) -> String {
    let body = strip_html_to_text(&entry.content);
    format!(
        "{}\n{}\n\nExported from Signet · {}\n\n{}\n",
        entry.title,
        "=".repeat(entry.title.chars().count().max(1)),
        chrono::Utc::now().format("%Y-%m-%d"),
        body.trim()
    )
}

fn strip_html_to_text(html: &str) -> String {
    // Insert newlines for block-ish closing tags so structure survives.
    let mut work = html.to_string();
    for tag in [
        "</p>", "</h1>", "</h2>", "</h3>", "</h4>", "</h5>", "</h6>",
        "</li>", "</ul>", "</ol>", "</div>", "</blockquote>", "<br>",
        "<br/>", "<br />",
    ] {
        work = work.replace(tag, "\n");
    }
    // Strip remaining tags.
    let mut out = String::with_capacity(work.len());
    let mut in_tag = false;
    for c in work.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            _ => out.push(c),
        }
    }
    let unescaped = html_unescape(&out);
    // Collapse runs of blank lines to a single blank line; trim each line.
    let mut lines: Vec<String> = unescaped
        .split('\n')
        .map(|l| l.trim().to_string())
        .collect();
    let mut result = String::new();
    let mut blank_run = 0;
    for line in lines.drain(..) {
        if line.is_empty() {
            blank_run += 1;
            if blank_run <= 1 {
                result.push('\n');
            }
        } else {
            blank_run = 0;
            result.push_str(&line);
            result.push('\n');
        }
    }
    result
}

/// Markdown export. Hand-rolled converter for the limited tag set the editor
/// emits (h1/2/3, p, strong/b, em/i, u, a, ul/ol/li, br). Anything else is
/// passed through as-is so it's at least readable.
fn render_md_export(entry: &DocumentEntry) -> String {
    let body = html_to_markdown(&entry.content);
    format!(
        "# {}\n\n*Exported from Signet · {}*\n\n---\n\n{}\n",
        entry.title,
        chrono::Utc::now().format("%Y-%m-%d"),
        body.trim()
    )
}

fn html_to_markdown(html: &str) -> String {
    // A series of lossy but predictable string replacements over a small set of
    // editor tags. Not a real HTML parser — but the editor's output is well-formed
    // enough for this to work on every block we emit.
    let mut s = html.to_string();

    // Normalize whitespace inside tags first (collapse newlines that aren't meaningful).
    s = s.replace("\r\n", "\n");

    // Block-level mappings (open-tag → marker, close-tag → newline).
    let block_pairs: &[(&str, &str, &str)] = &[
        ("<h1>", "</h1>", "# "),
        ("<h2>", "</h2>", "## "),
        ("<h3>", "</h3>", "### "),
        ("<h4>", "</h4>", "#### "),
        ("<h5>", "</h5>", "##### "),
        ("<h6>", "</h6>", "###### "),
    ];
    for (open, close, marker) in block_pairs {
        s = s.replace(open, &format!("\n\n{}", marker));
        s = s.replace(close, "\n");
    }
    s = s.replace("<p>", "\n\n").replace("</p>", "\n");
    s = s
        .replace("<br>", "  \n")
        .replace("<br/>", "  \n")
        .replace("<br />", "  \n");

    // Inline pairs.
    let inline_pairs: &[(&str, &str, &str)] = &[
        ("<strong>", "</strong>", "**"),
        ("<b>", "</b>", "**"),
        ("<em>", "</em>", "*"),
        ("<i>", "</i>", "*"),
        ("<code>", "</code>", "`"),
    ];
    for (open, close, marker) in inline_pairs {
        s = s.replace(open, marker);
        s = s.replace(close, marker);
    }
    // Underline has no markdown equivalent — drop the tags.
    s = s.replace("<u>", "").replace("</u>", "");

    // Links: <a href="X">Y</a> → [Y](X). Naive — handles the common case.
    s = convert_links(&s);

    // Lists.
    s = convert_lists(&s);

    // Strip any remaining tags as a safety net.
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            _ => out.push(c),
        }
    }
    let unescaped = html_unescape(&out);

    // Collapse 3+ blank lines to 2.
    let mut result = String::with_capacity(unescaped.len());
    let mut prev_blank = 0;
    for line in unescaped.split('\n') {
        if line.trim().is_empty() {
            prev_blank += 1;
            if prev_blank <= 2 {
                result.push('\n');
            }
        } else {
            prev_blank = 0;
            result.push_str(line);
            result.push('\n');
        }
    }
    result
}

fn convert_links(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    loop {
        match rest.find("<a ") {
            None => {
                out.push_str(rest);
                return out;
            }
            Some(start) => {
                out.push_str(&rest[..start]);
                let after_open = &rest[start..];
                // Find href value
                let href = after_open
                    .find("href=\"")
                    .map(|i| &after_open[i + 6..])
                    .and_then(|h| h.find('"').map(|end| &h[..end]))
                    .unwrap_or("");
                // Find end of opening tag and the closing </a>
                let body_start = match after_open.find('>') {
                    Some(i) => i + 1,
                    None => {
                        out.push_str(after_open);
                        return out;
                    }
                };
                let body_end = match after_open[body_start..].find("</a>") {
                    Some(i) => body_start + i,
                    None => {
                        out.push_str(after_open);
                        return out;
                    }
                };
                let text = &after_open[body_start..body_end];
                if href.is_empty() {
                    out.push_str(text);
                } else {
                    out.push_str(&format!("[{}]({})", text, href));
                }
                rest = &after_open[body_end + 4..];
            }
        }
    }
}

fn convert_lists(s: &str) -> String {
    // Bulleted lists.
    let mut s = s.to_string();
    s = s.replace("<ul>", "\n").replace("</ul>", "\n");
    // Ordered lists — leave as-is, every <li> inside becomes 1. (Markdown
    // renumbers automatically when rendered).
    s = s.replace("<ol>", "\n").replace("</ol>", "\n");
    s = s.replace("<li>", "- ").replace("</li>", "\n");
    s
}

// ───────── PDF rendering ─────────────────────────────────────────────────

#[derive(Debug, Clone)]
enum Block {
    Heading(u8, String),
    Paragraph(String),
    Bullet(String),
    Numbered(usize, String),
    HorizontalRule,
}

/// Parse the editor's HTML into a flat sequence of layout blocks. Drops inline
/// markup (bold/italic/links) — text only. Good enough for v1 PDF.
fn parse_blocks(html: &str) -> Vec<Block> {
    let plain = strip_inline(html);
    let mut blocks: Vec<Block> = Vec::new();
    let mut rest = plain.as_str();
    while !rest.is_empty() {
        // Find the next opening tag of interest.
        let lower = rest.to_lowercase();
        let candidates: &[(&str, &str)] = &[
            ("<h1>", "</h1>"),
            ("<h2>", "</h2>"),
            ("<h3>", "</h3>"),
            ("<h4>", "</h4>"),
            ("<h5>", "</h5>"),
            ("<h6>", "</h6>"),
            ("<p>", "</p>"),
            ("<ul>", "</ul>"),
            ("<ol>", "</ol>"),
            ("<hr>", ""),
            ("<hr/>", ""),
            ("<hr />", ""),
        ];
        let mut next_pos: Option<(usize, &str, &str)> = None;
        for (open, close) in candidates {
            if let Some(p) = lower.find(open) {
                if next_pos.map_or(true, |(c, _, _)| p < c) {
                    next_pos = Some((p, open, close));
                }
            }
        }
        match next_pos {
            None => {
                // Trailing free text → paragraph
                let t = rest.trim();
                if !t.is_empty() {
                    blocks.push(Block::Paragraph(collapse(t)));
                }
                break;
            }
            Some((p, open, close)) => {
                // Anything before the tag → free paragraph
                let before = rest[..p].trim();
                if !before.is_empty() {
                    blocks.push(Block::Paragraph(collapse(before)));
                }
                if close.is_empty() {
                    // Self-closing (hr)
                    blocks.push(Block::HorizontalRule);
                    rest = &rest[p + open.len()..];
                    continue;
                }
                // Find the matching close.
                let after_open = &rest[p + open.len()..];
                let lower2 = after_open.to_lowercase();
                let end = match lower2.find(close) {
                    Some(e) => e,
                    None => {
                        rest = &rest[p + open.len()..];
                        continue;
                    }
                };
                let inner = &after_open[..end];
                match open {
                    "<h1>" => blocks.push(Block::Heading(1, collapse(inner))),
                    "<h2>" => blocks.push(Block::Heading(2, collapse(inner))),
                    "<h3>" => blocks.push(Block::Heading(3, collapse(inner))),
                    "<h4>" | "<h5>" | "<h6>" => {
                        blocks.push(Block::Heading(4, collapse(inner)))
                    }
                    "<p>" => {
                        let c = collapse(inner);
                        if !c.is_empty() {
                            blocks.push(Block::Paragraph(c));
                        }
                    }
                    "<ul>" => {
                        for item in parse_list_items(inner) {
                            blocks.push(Block::Bullet(item));
                        }
                    }
                    "<ol>" => {
                        for (i, item) in parse_list_items(inner).into_iter().enumerate() {
                            blocks.push(Block::Numbered(i + 1, item));
                        }
                    }
                    _ => {}
                }
                rest = &after_open[end + close.len()..];
            }
        }
    }
    blocks
}

fn parse_list_items(html: &str) -> Vec<String> {
    let mut items = Vec::new();
    let mut rest = html;
    let lower = html.to_lowercase();
    let mut search_from = 0;
    loop {
        let li_open = lower[search_from..].find("<li>");
        match li_open {
            None => break,
            Some(rel) => {
                let start = search_from + rel + "<li>".len();
                let after = &lower[start..];
                let close_rel = match after.find("</li>") {
                    Some(c) => c,
                    None => break,
                };
                let raw = &rest[start..start + close_rel];
                let text = collapse(raw);
                if !text.is_empty() {
                    items.push(text);
                }
                search_from = start + close_rel + "</li>".len();
            }
        }
    }
    items
}

/// Strip inline-only tags (bold/italic/underline/anchor/code/span/br) but keep
/// the surrounding block tags intact.
fn strip_inline(html: &str) -> String {
    let mut s = html.replace("<br>", " ").replace("<br/>", " ").replace("<br />", " ");
    for tag in ["strong", "b", "em", "i", "u", "code", "span", "a"] {
        // Open with attrs: e.g. <a href="...">
        s = strip_tag_with_attrs(&s, tag);
        // Close
        s = s.replace(&format!("</{}>", tag), "");
    }
    s
}

fn strip_tag_with_attrs(s: &str, tag: &str) -> String {
    let needle_lower = format!("<{}", tag.to_lowercase());
    let lower = s.to_lowercase();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    let bytes = s.as_bytes();
    while i < s.len() {
        if lower[i..].starts_with(&needle_lower) {
            // Skip until '>'
            if let Some(close_rel) = s[i..].find('>') {
                i += close_rel + 1;
                continue;
            }
        }
        // Push one char (handle multi-byte by finding next char boundary)
        let mut step = 1;
        while !s.is_char_boundary(i + step) && i + step < bytes.len() {
            step += 1;
        }
        out.push_str(&s[i..i + step]);
        i += step;
    }
    out
}

fn collapse(s: &str) -> String {
    html_unescape(s)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

// Page geometry (A4 portrait, mm)
const PAGE_W: f32 = 210.0;
const PAGE_H: f32 = 297.0;
const MARGIN_X: f32 = 22.0;
const MARGIN_TOP: f32 = 22.0;
const MARGIN_BOTTOM: f32 = 22.0;

struct Cursor {
    layer: PdfLayerReference,
    page_idx: usize,
    y: f32,
}

fn render_pdf_export(entry: &DocumentEntry, output_path: &str) -> Result<(), String> {
    let (doc, page1, layer1) =
        PdfDocument::new(&entry.title, Mm(PAGE_W), Mm(PAGE_H), "Layer 1");
    let layer = doc.get_page(page1).get_layer(layer1);
    let regular = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("Font load failed: {}", e))?;
    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| format!("Font load failed: {}", e))?;

    let mut cur = Cursor {
        layer,
        page_idx: 0,
        y: PAGE_H - MARGIN_TOP,
    };

    // Title
    write_block(&doc, &mut cur, &entry.title, &bold, 22.0, 26.0)?;
    // "Exported from Signet — date" subtitle
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    write_block(
        &doc,
        &mut cur,
        &format!("Exported from Signet · {}", date),
        &regular,
        9.0,
        12.0,
    )?;

    // Body
    let blocks = parse_blocks(&entry.content);
    for block in blocks {
        match block {
            Block::Heading(1, text) => write_block(&doc, &mut cur, &text, &bold, 18.0, 22.0)?,
            Block::Heading(2, text) => write_block(&doc, &mut cur, &text, &bold, 14.0, 18.0)?,
            Block::Heading(3, text) => write_block(&doc, &mut cur, &text, &bold, 12.0, 16.0)?,
            Block::Heading(_, text) => write_block(&doc, &mut cur, &text, &bold, 11.0, 14.0)?,
            Block::Paragraph(text) => write_block(&doc, &mut cur, &text, &regular, 11.0, 14.0)?,
            Block::Bullet(text) => write_bullet(&doc, &mut cur, "•", &text, &regular, 11.0)?,
            Block::Numbered(n, text) => {
                write_bullet(&doc, &mut cur, &format!("{}.", n), &text, &regular, 11.0)?
            }
            Block::HorizontalRule => {
                use printpdf::{Color, Line, Point, Rgb};
                if cur.y < MARGIN_BOTTOM + 6.0 {
                    new_page(&doc, &mut cur);
                }
                cur.y -= 4.0;
                cur.layer
                    .set_outline_color(Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None)));
                cur.layer.set_outline_thickness(0.5);
                cur.layer.add_line(Line {
                    points: vec![
                        (Point::new(Mm(MARGIN_X), Mm(cur.y)), false),
                        (Point::new(Mm(PAGE_W - MARGIN_X), Mm(cur.y)), false),
                    ],
                    is_closed: false,
                });
                cur.y -= 6.0;
            }
        }
    }

    let file = File::create(output_path)
        .map_err(|e| format!("Cannot create PDF: {}", e))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .map_err(|e| format!("Failed to write PDF: {}", e))?;
    Ok(())
}

fn new_page(doc: &PdfDocumentReference, cur: &mut Cursor) {
    cur.page_idx += 1;
    let (page, layer) = doc.add_page(Mm(PAGE_W), Mm(PAGE_H), format!("Layer {}", cur.page_idx + 1));
    cur.layer = doc.get_page(page).get_layer(layer);
    cur.y = PAGE_H - MARGIN_TOP;
}

/// Width of the writable area in mm.
fn line_width_mm() -> f32 {
    PAGE_W - MARGIN_X * 2.0
}

/// Approximate Helvetica character advance in mm at a given point size.
/// Helvetica's average glyph width is ~0.5 em; em ≈ font_size in points; 1 pt = 0.3528 mm.
fn approx_char_width_mm(font_size: f32) -> f32 {
    font_size * 0.5 * 0.3528
}

/// Wrap text into lines that fit within `max_width_mm`. Greedy by words.
fn wrap_text(text: &str, font_size: f32, max_width_mm: f32) -> Vec<String> {
    let char_w = approx_char_width_mm(font_size);
    let max_chars = (max_width_mm / char_w).floor() as usize;
    if max_chars == 0 {
        return vec![text.to_string()];
    }
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        let needs_space = !current.is_empty();
        let new_len = current.chars().count() + if needs_space { 1 } else { 0 } + word.chars().count();
        if new_len <= max_chars {
            if needs_space {
                current.push(' ');
            }
            current.push_str(word);
        } else {
            if !current.is_empty() {
                lines.push(std::mem::take(&mut current));
            }
            // If the single word is too long, hard-break it.
            if word.chars().count() > max_chars {
                let mut chunk = String::new();
                for c in word.chars() {
                    if chunk.chars().count() >= max_chars {
                        lines.push(std::mem::take(&mut chunk));
                    }
                    chunk.push(c);
                }
                current = chunk;
            } else {
                current = word.to_string();
            }
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

fn write_block(
    doc: &PdfDocumentReference,
    cur: &mut Cursor,
    text: &str,
    font: &IndirectFontRef,
    size: f32,
    line_height_mm: f32,
) -> Result<(), String> {
    let lines = wrap_text(text, size, line_width_mm());
    for line in lines {
        if cur.y < MARGIN_BOTTOM + line_height_mm {
            new_page(doc, cur);
        }
        cur.layer
            .use_text(line, size, Mm(MARGIN_X), Mm(cur.y), font);
        cur.y -= line_height_mm;
    }
    // Trailing block spacing
    cur.y -= line_height_mm * 0.4;
    Ok(())
}

fn write_bullet(
    doc: &PdfDocumentReference,
    cur: &mut Cursor,
    marker: &str,
    text: &str,
    font: &IndirectFontRef,
    size: f32,
) -> Result<(), String> {
    let indent_mm = 6.0;
    let line_height = size * 0.45;
    // Wrap allowing for the indented start.
    let lines = wrap_text(text, size, line_width_mm() - indent_mm);
    for (i, line) in lines.iter().enumerate() {
        if cur.y < MARGIN_BOTTOM + line_height {
            new_page(doc, cur);
        }
        if i == 0 {
            cur.layer
                .use_text(marker, size, Mm(MARGIN_X), Mm(cur.y), font);
        }
        cur.layer
            .use_text(line, size, Mm(MARGIN_X + indent_mm), Mm(cur.y), font);
        cur.y -= line_height;
    }
    cur.y -= line_height * 0.4;
    Ok(())
}
