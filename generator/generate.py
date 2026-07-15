"""Renders the DIY wizard's Jinja2 templates + data/diy_steps.json into
static HTML/CSS/JS, written to both the production site (diy-wizard/) and
the proto sandbox (proto/diy-wizard/) so they never drift out of sync.
Re-run after editing anything in templates/, data/, or static/.

    python3 generator/generate.py
"""
import json
import shutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

GENERATOR_DIR = Path(__file__).parent
REPO_ROOT = GENERATOR_DIR.parent
OUTPUT_DIRS = (REPO_ROOT / "diy-wizard", REPO_ROOT / "proto" / "diy-wizard")

STATIC_FILES = ("wizard.css", "wizard.js", "thank-you.html")


def main():
    env = Environment(
        loader=FileSystemLoader(GENERATOR_DIR / "templates"),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    data = json.loads((GENERATOR_DIR / "data" / "diy_steps.json").read_text())

    builder_html = env.get_template("builder.html.j2").render(**data)
    review_html = env.get_template("review.html.j2").render(**data)

    for output_dir in OUTPUT_DIRS:
        output_dir.mkdir(parents=True, exist_ok=True)

        (output_dir / "index.html").write_text(builder_html)
        (output_dir / "review.html").write_text(review_html)

        for name in STATIC_FILES:
            shutil.copyfile(GENERATOR_DIR / "static" / name, output_dir / name)

        print(f"Generated {output_dir}/ (index.html, review.html, {', '.join(STATIC_FILES)})")


if __name__ == "__main__":
    main()
