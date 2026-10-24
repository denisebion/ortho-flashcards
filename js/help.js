// Links for the "Add more cards" guide. When the app is hosted on GitHub Pages
// (https://<user>.github.io/<repo>/) the repository address can be worked out from the
// page address, so the guide can link straight to the right upload page.

const BRANCH = 'main';

// -> { user, repo, base } or null when not on github.io (e.g. running locally)
export function repoFromLocation(hostname, pathname) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(hostname);
  if (!m) return null;
  const user = m[1];
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  // https://user.github.io/ is served by the repo named "user.github.io"
  const repo = firstSegment || hostname;
  return { user, repo, base: `https://github.com/${user}/${repo}` };
}

export function repoLinks(repo) {
  return {
    upload: `${repo.base}/upload/${BRANCH}/data`, // GitHub's "Upload files" page for the data folder
    dataFolder: `${repo.base}/tree/${BRANCH}/data`,
    actions: `${repo.base}/actions`,
  };
}
