# johnmachado.dev

Personal website of John Machado.

**Live site:** https://johnmachado.dev

Built with plain HTML, CSS, and JavaScript: no framework. GitHub Pages builds the blog from Markdown with Jekyll on every merge into main. Responsive across phones, tablets, and desktops; accessible (keyboard navigation, WCAG AA contrast, reduced-motion support); and fast (about 1.6 MB with every image loaded). The contact form is delivered through Web3Forms, and the site is hosted on GitHub Pages.

## Run locally

Needs Ruby 3.3 and Bundler. The Gemfile installs the same Jekyll version GitHub Pages uses.

    bundle install
    bundle exec jekyll serve --drafts

Then open http://localhost:4000. `--drafts` also shows the posts in `_drafts/`.

## Write a blog post

Add a Markdown file to `_posts/`, named with the date and a short name for the link:

    _posts/2026-11-02-training-gpt2-from-scratch.md

It goes live at `johnmachado.dev/blog/training-gpt2-from-scratch/`. Start the file with:

    ---
    title: Training GPT-2 from scratch on 10 billion tokens
    summary: One sentence, shown on the blog page and in link previews.
    tags: [LLMs, PyTorch]
    ---

Then write the post in Markdown. Put images in `assets/blog/<short name>/` (with location and camera data removed). Two shortcuts:

    {% include figure.html src="/assets/blog/post-name/chart.png" alt="What it shows" caption="Optional caption" %}
    {% include youtube.html id="VIDEO_ID" title="Video title" %}

To give a post its own share image (the picture shown when its link is shared on LinkedIn, Facebook, X, or in messages), save a 1200 × 630 image as `assets/blog/<short name>/share.jpg` and add `image: /assets/blog/<short name>/share.jpg` to the front matter. Without one, the post uses the site-wide card.

To show buttons under the tags that link to the post's model, code, or anything else, list them in the front matter. `icon` is optional and can be `hf` or `github`.

    links:
      - label: Model on Hugging Face
        url: https://huggingface.co/<user>/<model>
        icon: hf

Code that only one post needs (an interactive figure, say) lives in that post's folder and loads only on that post: list the files in its front matter, and keep `styles.css` and `main.js` for what every page uses.

    styles: [/assets/blog/<short name>/figure.css]
    scripts: [/assets/blog/<short name>/figure.js]

Unfinished posts go in `_drafts/` (no date in the file name). That folder stays on this computer and is never published.

The Blog menu link, the latest post under the homepage socials, and the homepage Blog section (the three newest posts) appear once the first post is in `_posts/`.
