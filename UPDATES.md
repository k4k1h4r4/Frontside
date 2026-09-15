# Navigation and releases

Edit `nav.js` to change the shared menu. Edit `nav.css` to change its appearance.
Pages with a site header use the same index-style navigation, including Arcade.
The three full-screen arcade games keep their existing game controls.

## Automatic publishing with GitHub Pages

One-time setup:

1. Commit these updated site files, `release.py`, `site-update.test.cjs`, and
   `.github/workflows/pages.yml` to the repository. Include the hidden `.github`
   folder; it contains the automation.
2. In the GitHub repository, open **Settings > Pages > Build and deployment**
   and select **GitHub Actions** as the source.
3. Keep the existing custom domain, `frontsidebar.com`, in Pages settings.
4. Open **Actions > Publish Frontside > Run workflow** on the default branch
   for the first deployment. Check that the build and deploy jobs both pass.
   If another custom Pages workflow already exists in the remote repository,
   replace/disable it so only this workflow publishes the site.

After setup, edit and commit only the files you want to change. Each push to the
repository's default branch automatically tests the update script, runs
`release.py` with a unique version, and deploys all public files together.
Other branches do not deploy. You can also use **Run workflow** to publish again.
Versions are generated in the build; no generated-file commits or manual version
changes are necessary. Python runs on GitHub's runner, not in visitors' browsers.

The deployment includes `CNAME`, images, Arcade, and the root site files. It
excludes Python scripts, tests, documentation, and local tool configuration.
If you add another public folder or standalone JavaScript file, add it to the
workflow's **Prepare public files** step.

Cloudflare continues to manage DNS; this workflow deploys directly to GitHub
Pages and needs no Cloudflare credentials or DNS changes. If Cloudflare also
proxies/caches the site, its cache rules must respect query strings.

## Manual publishing (optional fallback)

1. Make your page, navigation, CSS, or JavaScript changes.
2. Run `python release.py 2026-09-15-03` with a new unique version each release.
   This stamps every HTML page and local CSS/JS URL, then writes `version.json`.
3. Upload the changed site files, including the stamped HTML, `nav.js`, `nav.css`,
   and `site-update.js`. Upload `version.json` last, or deploy everything atomically.
   The Python script and this guide do not need to be uploaded.

Every page checks `version.json` on opening, returning to the foreground, browser
history restoration, and reconnecting. Checks bypass the browser cache and use a
unique query string. An outdated page navigates to a fresh URL, preserving its
existing query parameters and fragment. A URL marker prevents a reload loop if
the server/CDN still returns an old page. Network errors leave the page usable.
There is no polling during active play, but returning to an outdated game can
reload it and reset unsaved game state.

Already-cached HTML from before this feature cannot run a script it never loaded.
For the first rollout, users may need to open a fresh link such as
`https://frontsidebar.com/?_site_version=2026-09-15-02` once.

If you control hosting/CDN cache rules, configure HTML, `version.json`, `nav.js`,
`nav.css`, and `site-update.js` to revalidate (`Cache-Control: no-cache`), and make
sure the CDN respects query strings. Purge existing HTML/CDN caches at rollout.
These are server response headers; HTML meta tags cannot enforce them.
No hosting/CDN settings are changed by these files.
