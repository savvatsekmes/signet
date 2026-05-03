use crate::state::AppState;
use image::GenericImageView;
use printpdf::{
    BuiltinFont, ColorBits, ColorSpace, Image, ImageTransform, ImageXObject, Mm, PdfDocument, Px,
};
use qrcode::QrCode;
use std::fs::File;
use std::io::BufWriter;
use tauri::State;

const LOGO_BYTES: &[u8] = include_bytes!("../../resources/signet-logo-256.png");
const WORDMARK_BYTES: &[u8] = include_bytes!("../../resources/signet-wordmark.png");

/// Decode an embedded PNG, composite alpha onto white, return RGB bytes + dimensions.
fn load_png_rgb(bytes: &[u8], label: &str) -> Result<(u32, u32, Vec<u8>), String> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| format!("{} decode failed: {}", label, e))?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let mut rgb = Vec::with_capacity((w * h * 3) as usize);
    for px in rgba.pixels() {
        let a = px[3] as f32 / 255.0;
        let r = (px[0] as f32 * a + 255.0 * (1.0 - a)) as u8;
        let g = (px[1] as f32 * a + 255.0 * (1.0 - a)) as u8;
        let b = (px[2] as f32 * a + 255.0 * (1.0 - a)) as u8;
        rgb.push(r);
        rgb.push(g);
        rgb.push(b);
    }
    let _ = img.dimensions();
    Ok((w, h, rgb))
}

fn load_logo_rgb() -> Result<(u32, u32, Vec<u8>), String> {
    load_png_rgb(LOGO_BYTES, "Logo")
}

fn load_wordmark_rgb() -> Result<(u32, u32, Vec<u8>), String> {
    load_png_rgb(WORDMARK_BYTES, "Wordmark")
}

/// Generate a one-page A4 recovery PDF for a given beneficiary.
/// Embeds their base64-encoded shard as a QR code, with plain-language
/// instructions for the eventual reader.
#[tauri::command]
pub async fn export_recovery_pdf(
    beneficiary_id: String,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 1. Pull beneficiary + shard data out under lock, then drop the lock.
    let (name, vault_path, shard_b64, _shard_index, threshold, total, access) = {
        let manifest_lock = state.manifest.lock().map_err(|_| "State lock poisoned")?;
        let manifest = manifest_lock.as_ref().ok_or("Vault is not unlocked")?;
        let beneficiary = manifest
            .beneficiaries
            .iter()
            .find(|b| b.id == beneficiary_id)
            .ok_or("Beneficiary not found")?;
        let shard_index = beneficiary
            .shard_index
            .ok_or("This beneficiary has no shard yet — generate shards first")?;
        let shard = manifest
            .shards
            .get(shard_index as usize)
            .ok_or("Shard data missing — regenerate shards")?
            .clone();
        let path_lock = state
            .vault_path
            .lock()
            .map_err(|_| "State lock poisoned")?;
        let vault_path = path_lock.clone().unwrap_or_default();
        (
            beneficiary.name.clone(),
            vault_path,
            shard,
            shard_index,
            manifest.shamir_config.required,
            manifest.shamir_config.total,
            beneficiary.access.clone(),
        )
    };

    // 2. Build a QR code from the base64 shard string.
    // Render at ~600 px so it scans cleanly at the printed 70 mm size.
    let qr = QrCode::new(shard_b64.as_bytes())
        .map_err(|e| format!("Failed to build QR code: {}", e))?;
    let qr_image = qr
        .render::<image::Luma<u8>>()
        .min_dimensions(600, 600)
        .quiet_zone(true)
        .dark_color(image::Luma([0u8]))
        .light_color(image::Luma([255u8]))
        .build();
    let qr_w = qr_image.width();
    let qr_h = qr_image.height();
    let qr_bytes: Vec<u8> = qr_image.into_raw();
    // Compute the dpi we need so the rendered image is the target width on the page.
    let qr_target_mm: f32 = 60.0;
    let qr_dpi: f32 = (qr_w as f32) * 25.4 / qr_target_mm;

    // 3. Build the PDF — A4 portrait.
    let (doc, page1, layer1) =
        PdfDocument::new("Signet Recovery Card", Mm(210.0), Mm(297.0), "Layer 1");
    let layer = doc.get_page(page1).get_layer(layer1);
    let font_regular = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("Font load failed: {}", e))?;
    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| format!("Font load failed: {}", e))?;

    // Header — logo top-left, wordmark + recovery card to the right
    let (logo_w, logo_h, logo_rgb) = load_logo_rgb()?;
    let logo_target_mm: f32 = 16.0;
    let logo_dpi: f32 = (logo_w as f32) * 25.4 / logo_target_mm;
    let logo_obj = ImageXObject {
        width: Px(logo_w as usize),
        height: Px(logo_h as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: true,
        image_data: logo_rgb,
        image_filter: None,
        clipping_bbox: None,
        smask: None,
    };
    let logo_image = Image::from(logo_obj);
    let logo_x: f32 = 20.0;
    let logo_bottom: f32 = 263.0; // top of logo will be at ~279
    logo_image.add_to_layer(
        layer.clone(),
        ImageTransform {
            translate_x: Some(Mm(logo_x)),
            translate_y: Some(Mm(logo_bottom)),
            rotate: None,
            scale_x: None,
            scale_y: None,
            dpi: Some(logo_dpi),
        },
    );

    // Wordmark image to the right of the ring logo
    let (wm_w, wm_h, wm_rgb) = load_wordmark_rgb()?;
    let wm_target_mm: f32 = 36.0; // wordmark width on the page
    let wm_dpi: f32 = (wm_w as f32) * 25.4 / wm_target_mm;
    let wm_height_mm: f32 = (wm_h as f32) * 25.4 / wm_dpi;
    let wm_obj = ImageXObject {
        width: Px(wm_w as usize),
        height: Px(wm_h as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: true,
        image_data: wm_rgb,
        image_filter: None,
        clipping_bbox: None,
        smask: None,
    };
    let wm_image = Image::from(wm_obj);
    // Vertically centre the wordmark with the ring logo (logo bottom 263, height 16 → centre 271)
    let wm_bottom: f32 = 271.0 - (wm_height_mm / 2.0);
    wm_image.add_to_layer(
        layer.clone(),
        ImageTransform {
            translate_x: Some(Mm(40.0)),
            translate_y: Some(Mm(wm_bottom)),
            rotate: None,
            scale_x: None,
            scale_y: None,
            dpi: Some(wm_dpi),
        },
    );
    layer.use_text(
        format!("Recovery card for {}", name),
        14.0,
        Mm(20.0),
        Mm(257.0),
        &font_bold,
    );

    // Horizontal rule (a thin black line)
    use printpdf::{Color, Line, LineCapStyle, LineDashPattern, Point, Rgb};
    let rule = Line {
        points: vec![
            (Point::new(Mm(20.0), Mm(252.0)), false),
            (Point::new(Mm(190.0), Mm(252.0)), false),
        ],
        is_closed: false,
    };
    layer.set_outline_color(Color::Rgb(Rgb::new(0.1, 0.04, 0.04, None)));
    layer.set_outline_thickness(0.5);
    layer.set_line_cap_style(LineCapStyle::Butt);
    layer.set_line_dash_pattern(LineDashPattern::default());
    layer.add_line(rule);

    // ─── KEY BLOCK (top) ──────────────────────────────────────────────────
    // QR on the left, captions + plaintext shard filling the rest of the page width.
    let qr_x_mm: f32 = 20.0;
    let qr_bottom_mm: f32 = 180.0; // top will be at ~240
    let qr_obj = ImageXObject {
        width: Px(qr_w as usize),
        height: Px(qr_h as usize),
        color_space: ColorSpace::Greyscale,
        bits_per_component: ColorBits::Bit8,
        interpolate: false,
        image_data: qr_bytes,
        image_filter: None,
        clipping_bbox: None,
        smask: None,
    };
    let qr_image_obj = Image::from(qr_obj);
    qr_image_obj.add_to_layer(
        layer.clone(),
        ImageTransform {
            translate_x: Some(Mm(qr_x_mm)),
            translate_y: Some(Mm(qr_bottom_mm)),
            rotate: None,
            scale_x: None,
            scale_y: None,
            dpi: Some(qr_dpi),
        },
    );

    let info_x: f32 = 88.0; // right of QR (QR ends at ~80, 8 mm gap)
    layer.use_text(
        "Your key shard — keep this card safe",
        11.0,
        Mm(info_x),
        Mm(238.0),
        &font_bold,
    );
    layer.use_text(
        format!(
            "This shard alone cannot open the vault — {} of {} required.",
            threshold, total
        ),
        9.0,
        Mm(info_x),
        Mm(232.0),
        &font_regular,
    );
    layer.use_text(
        "Scan the QR with the app, or type the key below by hand.",
        9.0,
        Mm(info_x),
        Mm(226.0),
        &font_regular,
    );

    // Plain-text shard. Single line if it fits at 8 pt Courier (≈ 100 chars in
    // ~120 mm of right-column width); otherwise wrap to two lines.
    let font_mono = doc
        .add_builtin_font(BuiltinFont::Courier)
        .map_err(|e| format!("Font load failed: {}", e))?;
    layer.use_text(
        "TYPED KEY",
        7.0,
        Mm(info_x),
        Mm(216.0),
        &font_bold,
    );
    let shard_chunks: Vec<String> = if shard_b64.len() <= 80 {
        vec![shard_b64.clone()]
    } else {
        chunk_str(&shard_b64, (shard_b64.len() + 1) / 2)
    };
    let mut shard_y = 210.0_f32;
    for line in &shard_chunks {
        layer.use_text(line, 9.0, Mm(info_x), Mm(shard_y), &font_mono);
        shard_y -= 5.0;
    }

    // Section divider above the instructions
    let inner_rule = Line {
        points: vec![
            (Point::new(Mm(20.0), Mm(170.0)), false),
            (Point::new(Mm(190.0), Mm(170.0)), false),
        ],
        is_closed: false,
    };
    layer.add_line(inner_rule);

    // ─── INSTRUCTIONS ─────────────────────────────────────────────────────
    layer.use_text("How to open the vault", 12.0, Mm(20.0), Mm(160.0), &font_bold);
    let steps: Vec<String> = vec![
        "1. Download Signet from signetvault.com".to_string(),
        "2. Find the vault file at the location below".to_string(),
        "3. Open Signet and choose 'Open with recovery shards'".to_string(),
        "4. Scan the QR code on this card with the app".to_string(),
        format!(
            "5. {} other keyholder{} must do the same",
            threshold.saturating_sub(1),
            if threshold > 2 { "s" } else { "" }
        ),
        "6. The vault will open".to_string(),
    ];
    let mut y = 153.0_f32;
    for step in &steps {
        layer.use_text(step, 10.0, Mm(20.0), Mm(y), &font_regular);
        y -= 6.0;
    }

    // ─── VAULT LOCATION ───────────────────────────────────────────────────
    layer.use_text("Vault file location", 11.0, Mm(20.0), Mm(110.0), &font_bold);
    let path_display = if vault_path.is_empty() {
        "(unknown — keep this card with the USB or device that holds the vault)".to_string()
    } else {
        vault_path.clone()
    };
    for (i, line) in wrap_to(&path_display, 70).into_iter().enumerate() {
        layer.use_text(line, 9.0, Mm(20.0), Mm(104.0 - (i as f32) * 5.0), &font_regular);
    }

    // ─── INTENDED ACCESS ──────────────────────────────────────────────────
    if !access.is_empty() {
        layer.use_text("Intended access", 11.0, Mm(20.0), Mm(80.0), &font_bold);
        let access_line = format!("This card is intended to grant: {}", access.join(", "));
        layer.use_text(&access_line, 9.0, Mm(20.0), Mm(74.0), &font_regular);
        layer.use_text(
            "(Anyone with enough shards can decrypt the full vault — please respect the owner's wishes.)",
            8.0,
            Mm(20.0),
            Mm(69.0),
            &font_regular,
        );
    }

    // ─── FOOTER ───────────────────────────────────────────────────────────
    layer.use_text(
        "In case of difficulty, visit signetvault.com",
        10.0,
        Mm(20.0),
        Mm(34.0),
        &font_regular,
    );
    let date_line = format!("Generated {}", chrono::Utc::now().format("%Y-%m-%d"));
    layer.use_text(date_line, 9.0, Mm(20.0), Mm(28.0), &font_regular);
    layer.use_text(
        "This card was generated by Signet — an encrypted local vault.",
        9.0,
        Mm(20.0),
        Mm(22.0),
        &font_regular,
    );

    // 4. Write the PDF.
    let file = File::create(&output_path)
        .map_err(|e| format!("Cannot create PDF file: {}", e))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .map_err(|e| format!("Failed to write PDF: {}", e))?;

    Ok(())
}

fn chunk_str(s: &str, n: usize) -> Vec<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let end = (i + n).min(bytes.len());
        // Safe because base64 is ASCII.
        out.push(String::from_utf8_lossy(&bytes[i..end]).to_string());
        i = end;
    }
    out
}

fn wrap_to(s: &str, max_chars: usize) -> Vec<String> {
    if s.len() <= max_chars {
        return vec![s.to_string()];
    }
    let mut out = Vec::new();
    let mut start = 0;
    while start < s.len() {
        let end = (start + max_chars).min(s.len());
        // Snap to a path separator if one is nearby.
        let slice = &s[start..end];
        let break_at = slice
            .rfind(|c: char| c == '\\' || c == '/' || c == ' ')
            .map(|i| start + i + 1)
            .unwrap_or(end);
        out.push(s[start..break_at].to_string());
        start = break_at;
    }
    out
}
