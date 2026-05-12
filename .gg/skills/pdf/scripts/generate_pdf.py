#!/usr/bin/env python3
"""
PDF Generator — Converts HTML documents to professional PDFs using WeasyPrint.

Injects a theme CSS file into the HTML before rendering, so the HTML only needs
semantic markup with CSS class names (no inline styles needed).

Usage:
    python3 generate_pdf.py --input file.html --output file.pdf [--theme dsfc]

Requirements:
    - Python 3.10+ (Homebrew recommended)
    - weasyprint: pip install weasyprint
    - pango: brew install pango (macOS native dependency)

If using the project venv:
    .venv/bin/python3 generate_pdf.py --input file.html --output file.pdf
"""

import argparse
import os
import re
import sys
from pathlib import Path

# Regex matching cells whose content is "numeric-looking" (currency, integers,
# percentages, ratios, blanks). Used by --editable to decide which <td> values
# to wrap in editable form inputs. Letters (other than k/K/m/M suffixes) make
# a cell non-numeric so labels like "Cash at Bank" stay as plain text.
NUMERIC_CELL_RE = re.compile(
    r'^\s*\(?-?\$?\s*[\d,]+(?:\.\d+)?\s*[%kKmM]?\)?\s*$'
)

EDITABLE_INPUT_STYLE = (
    'appearance: auto; -webkit-appearance: auto; border: none; '
    'background: transparent; font: inherit; color: inherit; '
    'padding: 0; margin: 0; width: 100%; box-sizing: border-box;'
)


def make_editable(html_content):
    """Wrap numeric <td> values in <input type="text"> so the resulting PDF has
    AcroForm fields the recipient can edit in Preview / Acrobat.

    Only cells in <tbody> whose text content matches NUMERIC_CELL_RE are
    converted. Header rows, label cells, and cells containing nested markup
    other than simple inline formatting are left untouched.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("Error: --editable requires beautifulsoup4. Install with:")
        print("  .venv/bin/pip install beautifulsoup4")
        sys.exit(1)

    soup = BeautifulSoup(html_content, 'html.parser')
    converted = 0
    for tbody in soup.find_all('tbody'):
        for td in tbody.find_all('td'):
            # Skip cells that contain block-level or complex children.
            if td.find(['table', 'ul', 'ol', 'div', 'p', 'br', 'input']):
                continue
            text = td.get_text()
            if not NUMERIC_CELL_RE.match(text):
                continue
            value = text.strip()
            # Preserve right-alignment from the original cell style.
            existing_style = td.get('style', '') or ''
            align = 'right' if 'right' in existing_style.lower() else 'left'
            input_html = (
                f'<input type="text" value="{value}" '
                f'style="{EDITABLE_INPUT_STYLE} text-align: {align};">'
            )
            td.clear()
            td.append(BeautifulSoup(input_html, 'html.parser'))
            converted += 1
    print(f"Editable: wrapped {converted} numeric cells in form inputs")
    return str(soup)


def get_project_root():
    """Walk up from this script to find the project root (contains .claude/)."""
    current = Path(__file__).resolve().parent
    for _ in range(10):
        if (current / '.claude').is_dir() or (current / '.git').is_dir():
            return str(current)
        current = current.parent
    # Fallback: assume project root is 4 levels up from this script
    return str(Path(__file__).resolve().parent.parent.parent.parent.parent)


def load_theme_css(theme_name, script_dir):
    """Load a theme CSS file from the themes/ directory."""
    theme_path = os.path.join(script_dir, 'themes', f'{theme_name}.css')
    if not os.path.exists(theme_path):
        available = [
            f.replace('.css', '')
            for f in os.listdir(os.path.join(script_dir, 'themes'))
            if f.endswith('.css')
        ]
        print(f"Error: Theme '{theme_name}' not found at {theme_path}")
        print(f"Available themes: {', '.join(available) or 'none'}")
        sys.exit(1)
    with open(theme_path, 'r') as f:
        return f.read()


def inject_css(html_content, css_content):
    """Inject CSS into an HTML document.

    If the HTML has a <head>, injects a <style> block into it.
    If not, wraps the content in a full HTML document structure.
    """
    if '<head' in html_content.lower():
        # Inject before </head>
        return re.sub(
            r'(</head>)',
            f'<style>\n{css_content}\n</style>\n\\1',
            html_content,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        # Wrap in full HTML structure
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
{css_content}
</style>
</head>
<body>
{html_content}
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser(
        description='Generate professional PDFs from HTML using WeasyPrint'
    )
    parser.add_argument(
        '--input', required=True,
        help='Path to the input HTML file'
    )
    parser.add_argument(
        '--output', required=True,
        help='Path for the output PDF file'
    )
    parser.add_argument(
        '--theme', default='dsfc',
        help='Theme name (maps to themes/<name>.css). Default: dsfc'
    )
    parser.add_argument(
        '--base-url',
        help='Base URL for resolving relative paths (images, etc). '
             'Defaults to the project root directory.'
    )
    parser.add_argument(
        '--editable', action='store_true',
        help='Produce an editable PDF: numeric table cells become AcroForm '
             'text fields the recipient can edit in Preview or Acrobat.'
    )
    args = parser.parse_args()

    # Resolve paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = args.base_url or get_project_root()
    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)

    # Validate input
    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)

    # Load HTML and CSS
    print(f"Reading HTML: {input_path}")
    with open(input_path, 'r') as f:
        html_content = f.read()

    print(f"Loading theme: {args.theme}")
    css_content = load_theme_css(args.theme, script_dir)

    # Inject CSS into HTML
    full_html = inject_css(html_content, css_content)

    # Optionally rewrite numeric cells as editable form inputs.
    if args.editable:
        full_html = make_editable(full_html)

    # Import weasyprint (late import so error messages are clearer)
    try:
        import weasyprint
    except OSError as e:
        if 'gobject' in str(e) or 'pango' in str(e):
            print("\nError: WeasyPrint native libraries not found.")
            print("Install them with: brew install pango")
            print("\nIf using system Python, use the project venv instead:")
            print("  .venv/bin/python3 generate_pdf.py ...")
            sys.exit(1)
        raise

    # Generate PDF
    print(f"Generating PDF...")
    doc = weasyprint.HTML(string=full_html, base_url=project_root)
    if args.editable:
        doc.write_pdf(output_path, pdf_forms=True)
    else:
        doc.write_pdf(output_path)

    # Report success
    file_size = os.path.getsize(output_path)
    size_str = f"{file_size / 1024:.0f} KB" if file_size < 1024 * 1024 else f"{file_size / (1024 * 1024):.1f} MB"
    print(f"PDF generated: {output_path} ({size_str})")


if __name__ == '__main__':
    main()
