"""Renders the DIY wizard's Jinja2 templates + data/diy_steps.json into
static HTML/CSS/JS under proto/diy-wizard/. Re-run after editing anything
in templates/, data/, or static/.

    python3 generator/generate.py
"""
import json
import shutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

GENERATOR_DIR = Path(__file__).parent
OUTPUT_DIR = GENERATOR_DIR.parent / "proto" / "diy-wizard"


def main():
    env = Environment(
        loader=FileSystemLoader(GENERATOR_DIR / "templates"),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    data = json.loads((GENERATOR_DIR / "data" / "diy_steps.json").read_text())

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    (OUTPUT_DIR / "index.html").write_text(
        env.get_template("builder.html.j2").render(**data)
    )
    (OUTPUT_DIR / "review.html").write_text(
        env.get_template("review.html.j2").render(**data)
    )

    for name in ("wizard.css", "wizard.js"):
        shutil.copyfile(GENERATOR_DIR / "static" / name, OUTPUT_DIR / name)

    print(f"Generated {OUTPUT_DIR}/ (index.html, review.html, wizard.css, wizard.js)")


if __name__ == "__main__":
    main()
