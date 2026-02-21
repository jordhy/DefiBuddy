import { getUncachableGitHubClient } from '../server/github';
import * as fs from 'fs';
import * as path from 'path';

const REPO_NAME = 'DefiBuddies';

const IGNORE = new Set([
  'node_modules', '.git', 'dist', '.cache', '.config', '.local',
  '.upm', '.replit', 'replit.nix', '.breakpoints',
  'generated-icon.png', 'replit_zip_error_log.txt',
  'attached_assets', 'references', 'snippets',
]);

function getAllFiles(dir: string, base: string = ''): { path: string; fullPath: string }[] {
  const results: { path: string; fullPath: string }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(full, rel));
    } else {
      results.push({ path: rel, fullPath: full });
    }
  }
  return results;
}

async function pushToGitHub() {
  console.log('Getting GitHub client...');
  const octokit = await getUncachableGitHubClient();

  const { data: user } = await octokit.users.getAuthenticated();
  console.log(`Authenticated as: ${user.login}`);

  let repo: any = null;
  try {
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({ per_page: 100 });
    repo = repos.find((r: any) => r.name.toLowerCase() === REPO_NAME.toLowerCase());
  } catch (e: any) {
    console.log('Could not list repos, trying direct lookup...');
  }

  if (!repo) {
    try {
      const { data: existingRepo } = await octokit.repos.get({ owner: user.login, repo: REPO_NAME });
      repo = existingRepo;
      console.log('Repo found via direct lookup.');
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }
  }

  if (!repo) {
    console.log(`Creating repo: ${REPO_NAME}...`);
    const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
      name: REPO_NAME,
      description: 'DefiBuddies - AI-powered crypto portfolio tracker',
      private: false,
      auto_init: false,
    });
    repo = newRepo;
    console.log('Repo created.');
  } else {
    console.log(`Repo "${repo.full_name}" already exists.`);
  }

  let mainSha: string | undefined;
  try {
    const { data: ref } = await octokit.git.getRef({ owner: user.login, repo: REPO_NAME, ref: 'heads/main' });
    mainSha = ref.object.sha;
  } catch (e: any) {
    if (e.status !== 404 && e.status !== 409) throw e;
  }

  if (!mainSha) {
    console.log('Initializing repo with README...');
    await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: REPO_NAME,
      path: 'README.md',
      message: 'Initial commit',
      content: Buffer.from('# DefiBuddies\nAI-powered crypto portfolio tracker\n').toString('base64'),
    });
    await new Promise(r => setTimeout(r, 2000));
    const { data: ref } = await octokit.git.getRef({ owner: user.login, repo: REPO_NAME, ref: 'heads/main' });
    mainSha = ref.object.sha;
    console.log('Repo initialized.');
  }

  const files = getAllFiles('/home/runner/workspace');
  console.log(`Found ${files.length} files to push...`);

  const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];

  let uploaded = 0;
  for (const file of files) {
    const content = fs.readFileSync(file.fullPath);
    const base64 = content.toString('base64');

    const { data: blob } = await octokit.git.createBlob({
      owner: user.login,
      repo: REPO_NAME,
      content: base64,
      encoding: 'base64',
    });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    uploaded++;
    if (uploaded % 10 === 0) console.log(`  ${uploaded}/${files.length} files...`);
  }
  console.log(`All ${uploaded} files uploaded as blobs.`);

  const { data: newTree } = await octokit.git.createTree({
    owner: user.login,
    repo: REPO_NAME,
    tree,
  });

  const { data: commit } = await octokit.git.createCommit({
    owner: user.login,
    repo: REPO_NAME,
    message: 'Push DefiBuddies from Replit',
    tree: newTree.sha,
    parents: [mainSha!],
  });

  await octokit.git.updateRef({
    owner: user.login,
    repo: REPO_NAME,
    ref: 'heads/main',
    sha: commit.sha,
    force: true,
  });

  console.log(`\nDone! Code pushed to: https://github.com/${user.login}/${REPO_NAME}`);
}

pushToGitHub().catch(err => {
  console.error('Push failed:', err.message);
  process.exit(1);
});
