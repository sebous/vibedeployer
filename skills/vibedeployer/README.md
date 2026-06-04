# vibedeployer skill

An [agent skill](https://docs.claude.com/en/docs/claude-code/skills) that lets Claude
publish and version **HTML documents** to [vibedeployer](https://vibedeployer.sebous.workers.dev)
and hand back a shareable URL. Every upload is a new version; the main URL always serves
the latest, and each version keeps a permanent URL.

## Install

With the [`skills`](https://github.com/obra/skills) CLI:

```bash
# from this repo (path or git)
npx skills install strv/vibedeployer/skills/vibedeployer

# or point at a local checkout
npx skills install ./skills/vibedeployer
```

Or install manually — copy the folder into your skills directory:

```bash
# Claude Code (project-level)
cp -r skills/vibedeployer .claude/skills/vibedeployer

# Claude Code (user-level, all projects)
cp -r skills/vibedeployer ~/.claude/skills/vibedeployer
```

The skill is just a directory with `SKILL.md` at its root, so any tool that follows the
[Agent Skills](https://docs.claude.com/en/docs/claude-code/skills) convention can load it.

## Configure

Get an API key from the dashboard (**API keys → Create key**), then:

```bash
export VIBEDEPLOYER_TOKEN="vd_xxxxxxxx"
# optional — only if you self-host on another domain:
export VIBEDEPLOYER_URL="https://your-host.workers.dev"
```

## Use

Once installed, just ask Claude things like:

> "Publish this HTML report and give me a link."
> "Update the q2-report doc with this new version."

Claude loads the skill and runs the bundled `scripts/vibedeploy.sh`:

```bash
scripts/vibedeploy.sh create report.html --title "Q2 Report" --slug q2-report
scripts/vibedeploy.sh push   q2-report report.html --comment "fixed totals"
scripts/vibedeploy.sh list
scripts/vibedeploy.sh get    q2-report
scripts/vibedeploy.sh delete q2-report
```

## Contents

| File | Purpose |
|---|---|
| `SKILL.md` | Instructions + triggers Claude reads |
| `REFERENCE.md` | Full REST API reference |
| `scripts/vibedeploy.sh` | `curl`-only CLI wrapper (no deps) |

See [REFERENCE.md](REFERENCE.md) for the raw API.
