// Client minimo delle API di GitHub (REST + GraphQL), con il token salvato sul telefono.

const API = 'https://api.github.com';

function base64Utf8(testo) {
	const byte = new TextEncoder().encode(testo);
	let s = '';
	for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode(...byte.subarray(i, i + 0x8000));
	return btoa(s);
}

const percorsoUrl = (p) => p.split('/').map(encodeURIComponent).join('/');

export class GitHub {
	constructor({ token, proprietario, vault, branch }) {
		Object.assign(this, { token, proprietario, vault, branch });
	}

	async rest(percorso, { accept = 'application/vnd.github+json', ...opz } = {}) {
		const r = await fetch(API + percorso, {
			...opz,
			cache: 'no-store',
			headers: { Authorization: `Bearer ${this.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' },
		});
		if (!r.ok) {
			const corpo = await r.text().catch(() => '');
			const e = new Error(`GitHub ${r.status} su ${percorso}: ${corpo.slice(0, 200)}`);
			e.status = r.status;
			throw e;
		}
		return accept.includes('raw') ? r.text() : r.json();
	}

	async gql(query, variables = {}) {
		const r = await fetch(`${API}/graphql`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, variables }),
		});
		const j = await r.json();
		if (!r.ok || j.errors) throw new Error(`GitHub GraphQL: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
		return j.data;
	}

	/** Ultimo commit del branch del vault. */
	async testa() {
		const b = await this.rest(`/repos/${this.proprietario}/${this.vault}/branches/${encodeURIComponent(this.branch)}`);
		return b.commit.sha;
	}

	/** Tutti i file del vault a quel commit: [{ path, sha }]. */
	async albero(oid) {
		const t = await this.rest(`/repos/${this.proprietario}/${this.vault}/git/trees/${oid}?recursive=1`);
		return t.tree.filter((x) => x.type === 'blob').map(({ path, sha }) => ({ path, sha }));
	}

	/** Testo di più blob per sha, a gruppi di 60 per chiamata GraphQL. */
	async blob(sha) {
		const out = {};
		for (let i = 0; i < sha.length; i += 60) {
			const gruppo = sha.slice(i, i + 60);
			const campi = gruppo.map((s, k) => `b${k}: object(oid: "${s}") { ... on Blob { text } }`).join('\n');
			const d = await this.gql(`query($o: String!, $n: String!) { repository(owner: $o, name: $n) { ${campi} } }`, {
				o: this.proprietario, n: this.vault,
			});
			gruppo.forEach((s, k) => { out[s] = d.repository[`b${k}`]?.text ?? ''; });
		}
		return out;
	}

	/** Testo di un file del vault a un commit (o al branch). */
	testo(percorso, ref = this.branch, repo = this.vault) {
		return this.rest(`/repos/${this.proprietario}/${repo}/contents/${percorsoUrl(percorso)}?ref=${encodeURIComponent(ref)}`, {
			accept: 'application/vnd.github.raw+json',
		});
	}

	/** Commit atomico di più file sul branch; fallisce se nel frattempo il branch è andato avanti. */
	async commit({ testaAttesa, titolo, corpo, file }) {
		const d = await this.gql(
			`mutation($in: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $in) { commit { oid url } } }`,
			{
				in: {
					branch: { repositoryNameWithOwner: `${this.proprietario}/${this.vault}`, branchName: this.branch },
					expectedHeadOid: testaAttesa,
					message: { headline: titolo, body: corpo },
					fileChanges: { additions: file.map(({ path, testo }) => ({ path, contents: base64Utf8(testo) })) },
				},
			},
		);
		return d.createCommitOnBranch.commit;
	}

	/** Push recenti di una repo (tutti i branch), dagli eventi di GitHub. */
	async push(repo) {
		const ev = await this.rest(`/repos/${this.proprietario}/${repo}/events?per_page=30`);
		return ev.filter((e) => e.type === 'PushEvent').map((e) => ({
			repo,
			id: e.id,
			chi: e.actor?.display_login ?? e.actor?.login ?? '?',
			quando: e.created_at,
			branch: (e.payload?.ref ?? '').replace('refs/heads/', ''),
			testa: e.payload?.head,
			prima: e.payload?.before,
			commit: (e.payload?.commits ?? []).map((c) => c.message.split('\n')[0]),
			quanti: e.payload?.size ?? e.payload?.commits?.length,
		}));
	}

	/**
	 * Commit e file di un push: confronto base...testa, oppure solo il commit di testa
	 * se la base manca (branch nuovo, force push).
	 */
	async push1(repo, testa, base) {
		const r = `/repos/${this.proprietario}/${repo}`;
		const forma = (c) => ({ sha: c.sha, titolo: c.commit.message.split('\n')[0], autore: c.commit.author?.name ?? '', url: c.html_url });
		if (base && !/^0+$/.test(base)) {
			try {
				const d = await this.rest(`${r}/compare/${base}...${testa}`);
				return { commit: d.commits.map(forma).reverse(), file: (d.files ?? []).map((f) => ({ path: f.filename, stato: f.status })), url: d.html_url };
			} catch { /* base sparita: ripiego sul commit di testa */ }
		}
		const c = await this.rest(`${r}/commits/${testa}`);
		return { commit: [forma(c)], file: (c.files ?? []).map((f) => ({ path: f.filename, stato: f.status })), url: c.html_url };
	}

	async messaggioCommit(repo, sha) {
		const c = await this.rest(`/repos/${this.proprietario}/${repo}/commits/${sha}`);
		return c.commit.message.split('\n')[0];
	}
}
