use std::path::PathBuf;
use std::io::BufWriter;

use clap::Parser;

use image::codecs::png::PngEncoder;
use image::{ImageEncoder, ImageReader};

use fast_image_resize::{IntoImageView, Resizer};
use fast_image_resize::images::Image;

#[derive(clap::Parser, Debug)]
struct Args {
    #[arg(long)]
    indir: PathBuf,

    #[arg(long)]
    outdir: PathBuf,

    #[arg(default_value=".3", long)]
    factor: f32,
}

fn main() {
    let args = Args::parse();
    let in_dir = std::fs::read_dir(&args.indir)
        .expect("Could not open input directory");
    for in_file in in_dir {
        let in_file = in_file.expect("Could not walk input directory");
        if in_file.file_type().unwrap().is_dir() {
            continue;
        }
        let in_path = in_file.path();
        let out_path = args.outdir.join(in_path.file_name().unwrap());
        eprintln!("Converting {} => {}", in_path.to_string_lossy(), out_path.to_string_lossy());
        let in_image = ImageReader::open(&in_path)
            .expect("Could not open image")
            .decode()
            .expect("Invalid image");
        let out_writer = std::fs::File::create(out_path).expect("Cannot create target file");
        let mut out_writer = BufWriter::new(out_writer);

        let out_width = (in_image.width() as f32 * args.factor) as u32;
        let out_height=  (in_image.height() as f32 * args.factor) as u32;
        let mut out_image = Image::new(
            out_width,
            out_height,
            in_image.pixel_type().unwrap(),
        );
        let mut resizer = Resizer::new();
        resizer.resize(&in_image, &mut out_image, None).unwrap();

        PngEncoder::new(&mut out_writer)
        .write_image(
            out_image.buffer(),
            out_width,
            out_height,
            in_image.color().into(),
        )
        .unwrap();
    }
}
