"""Push local commits to GitHub through the REST API (gh), for machines where git.exe has no network.

Recreates each commit missing on the remote branch with the same tree, message, author, committer
and dates, so the commit hashes match the local ones. Fast-forward only.
Usage: python tools/gh_push.py [branch]   (default: main)
"""
import base64
import json
import subprocess
import sys

GH = r"C:\Program Files\GitHub CLI\gh.exe"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True).stdout.decode("utf-8")


def api(method: str, path: str, body: dict | None = None, ok404: bool = False):
    cmd = [GH, "api", "-X", method, path]
    if body is not None:
        cmd += ["--input", "-"]
    r = subprocess.run(cmd, input=json.dumps(body).encode() if body is not None else None, capture_output=True)
    if r.returncode != 0:
        if ok404 and (b"404" in r.stderr + r.stdout or b"409" in r.stderr + r.stdout):
            return None
        raise SystemExit(f"gh api {method} {path} failed: {r.stdout.decode()} {r.stderr.decode()}")
    return json.loads(r.stdout or b"null")


def person(fmt: str, sha: str) -> dict:
    name, email, date = git("show", "-s", f"--format={fmt}", sha).strip().split("\x1f")
    return {"name": name, "email": email, "date": date}


def main():
    branch = sys.argv[1] if len(sys.argv) > 1 else "main"
    repo = json.loads(subprocess.run([GH, "repo", "view", "--json", "nameWithOwner"], capture_output=True, check=True).stdout)["nameWithOwner"]
    remote = api("GET", f"repos/{repo}/git/ref/heads/{branch}", ok404=True)
    remote_sha = remote["object"]["sha"] if remote else None

    if remote_sha is None:
        # The git data API refuses an empty repo; seed it with a throwaway commit we never reference.
        api("PUT", f"repos/{repo}/contents/.init", {"message": "init", "content": "", "branch": branch})
    commits = git("rev-list", "--reverse", branch if not remote_sha else f"{remote_sha}..{branch}").split()
    if not commits:
        print("up to date")
        return

    blobs: dict[str, str] = {}
    for sha in commits:
        entries = []
        for line in git("ls-tree", "-r", sha).splitlines():
            meta, path = line.split("\t", 1)
            mode, _, blob = meta.split()
            if blob not in blobs:
                data = subprocess.run(["git", "cat-file", "blob", blob], check=True, capture_output=True).stdout
                created = api("POST", f"repos/{repo}/git/blobs", {"content": base64.b64encode(data).decode(), "encoding": "base64"})
                assert created["sha"] == blob, f"blob mismatch for {path}"
                blobs[blob] = created["sha"]
            entries.append({"path": path, "mode": mode, "type": "blob", "sha": blob})
        tree = api("POST", f"repos/{repo}/git/trees", {"tree": entries})
        assert tree["sha"] == git("rev-parse", f"{sha}^{{tree}}").strip(), "tree mismatch"
        parents = git("show", "-s", "--format=%P", sha).split()
        body = {
            "message": git("show", "-s", "--format=%B", sha).rstrip("\n") + "\n",
            "tree": tree["sha"],
            "parents": parents,
            "author": person("%an%x1f%ae%x1f%aI", sha),
            "committer": person("%cn%x1f%ce%x1f%cI", sha),
        }
        made = api("POST", f"repos/{repo}/git/commits", body)
        if made["sha"] != sha:
            raise SystemExit(f"commit hash mismatch: local {sha} remote {made['sha']}")
        print("pushed", sha[:7])

    head = commits[-1]
    if remote_sha:
        api("PATCH", f"repos/{repo}/git/refs/heads/{branch}", {"sha": head, "force": False})
    else:
        api("PATCH", f"repos/{repo}/git/refs/heads/{branch}", {"sha": head, "force": True})
    print(f"{branch} -> {head[:7]}")


if __name__ == "__main__":
    main()
