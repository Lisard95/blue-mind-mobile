// Logica dell'approvazione del design (skill `approvazione` del vault), senza rete né DOM.
// Le note si modificano riga per riga: il frontmatter resta com'è tranne le chiavi toccate.

export const STATI = ['bozza', 'in revisione', 'approvata', 'da rivedere', 'respinta'];
export const DIRETTORE = 'Andrea Bianchini';
// Organigramma, "Approvazione degli elementi": sempre obbligatorie per i giochi.
export const RICHIESTI_GIOCO = ['Andrea Bianchini', 'Magda Janik', 'Stefano Gosta'];
export const RICHIESTI_SOFTWARE = ['Andrea Bianchini'];

const togliVirgolette = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');

function valore(v) {
	const s = v.trim();
	if (s.startsWith('[') && s.endsWith(']')) {
		const dentro = s.slice(1, -1).trim();
		return dentro ? dentro.split(',').map(togliVirgolette).filter(Boolean) : [];
	}
	return togliVirgolette(s);
}

/** Limiti del frontmatter: indici delle righe `---` di apertura e chiusura, o null. */
function limiti(righe) {
	if (righe[0]?.trim() !== '---') return null;
	const fine = righe.findIndex((r, i) => i > 0 && r.trim() === '---');
	return fine > 0 ? [0, fine] : null;
}

/** Frontmatter semplice: scalari, liste in riga `[a, b]` e liste a blocco `- a`. */
export function leggiFrontmatter(testo) {
	const righe = testo.split(/\r?\n/);
	const lim = limiti(righe);
	const dati = {};
	if (!lim) return dati;
	let chiave = null;
	for (let i = 1; i < lim[1]; i++) {
		const r = righe[i];
		const m = r.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
		if (m) {
			chiave = m[1];
			dati[chiave] = m[2].trim() === '' ? null : valore(m[2]);
		} else if (chiave && /^\s*-\s+/.test(r)) {
			if (!Array.isArray(dati[chiave])) dati[chiave] = [];
			dati[chiave].push(togliVirgolette(r.replace(/^\s*-\s+/, '')));
		}
	}
	return dati;
}

/** Corpo della nota senza frontmatter. */
export function corpo(testo) {
	const righe = testo.split(/\r?\n/);
	const lim = limiti(righe);
	return lim ? righe.slice(lim[1] + 1).join('\n') : testo;
}

const scrivi = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : v == null ? '' : String(v));

/** Imposta una chiave del frontmatter (sostituisce anche una lista a blocco); la aggiunge se manca. */
export function impostaChiave(testo, chiave, v) {
	const a_capo = testo.includes('\r\n') ? '\r\n' : '\n';
	const righe = testo.split(/\r?\n/);
	const lim = limiti(righe);
	const nuova = `${chiave}: ${scrivi(v)}`.trimEnd();
	if (!lim) return ['---', nuova, '---', ...righe].join(a_capo);
	const i = righe.findIndex((r, k) => k > 0 && k < lim[1] && r.startsWith(`${chiave}:`));
	if (i < 0) {
		righe.splice(lim[1], 0, nuova);
	} else {
		let fine = i + 1;
		while (fine < lim[1] && /^\s*-\s+/.test(righe[fine])) fine++;
		righe.splice(i, fine - i, nuova);
	}
	return righe.join(a_capo);
}

/** Le note che possono avere un'approvazione: design dei progetti, non fonti, log o registri. */
export function candidata(percorso) {
	return (
		percorso.startsWith('Progetti/') &&
		percorso.endsWith('.md') &&
		!/\/(Fonti|Log|Playtest|Immagini)\//.test(percorso) &&
		!/\/(Registro|Stato|Roadmap|Sessione|North Star)\.md$/.test(percorso) &&
		!/ Archive — /.test(percorso)
	);
}

export const progettoDi = (percorso) => percorso.split('/')[1];
export const notaPrincipale = (progetto) => `Progetti/${progetto}/${progetto}.md`;
export const nomeNota = (percorso) => percorso.split('/').pop().replace(/\.md$/, '');

/** Chi deve approvare: lista `approvatori` nella nota, altrimenti la regola dell'Organigramma. */
export function richiesti(fm, tipoProgetto) {
	if (Array.isArray(fm.approvatori) && fm.approvatori.length) return fm.approvatori;
	return tipoProgetto === 'software' ? RICHIESTI_SOFTWARE : RICHIESTI_GIOCO;
}

const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Aggiunge una riga alla sezione `## Revisione` (la crea in fondo se manca). */
export function aggiungiRevisione(testo, riga) {
	const a_capo = testo.includes('\r\n') ? '\r\n' : '\n';
	const righe = testo.split(/\r?\n/);
	const i = righe.findIndex((r) => /^##\s+Revisione\s*$/.test(r));
	if (i < 0) {
		while (righe.length && righe[righe.length - 1].trim() === '') righe.pop();
		return [...righe, '', '## Revisione', riga, ''].join(a_capo);
	}
	let fine = i + 1;
	while (fine < righe.length && !/^#{1,2}\s/.test(righe[fine])) fine++;
	let dove = fine;
	while (dove > i + 1 && righe[dove - 1].trim() === '') dove--;
	righe.splice(dove, 0, riga);
	return righe.join(a_capo);
}

/**
 * Applica un voto alla nota.
 * voto: 'approvo' | 'modifiche' | 'respingo'.
 * Ritorna { testo, esito, mancano } oppure lancia un errore se la nota non è in revisione.
 */
export function applicaVoto({ testo, voto, nome, motivo = '', oggi, tipoProgetto }) {
	const fm = leggiFrontmatter(testo);
	if (fm.approvazione !== 'in revisione') {
		throw new Error(`La nota è "${fm.approvazione ?? 'senza stato'}": si vota solo quando è "in revisione".`);
	}
	if (voto !== 'approvo' && !motivo.trim()) throw new Error('Serve il motivo.');
	const approvata = lista(fm.approvata_da);
	const respinta = lista(fm.respinta_da);
	let t = testo;
	let esito = 'in revisione';

	if (voto === 'approvo') {
		if (!approvata.includes(nome)) approvata.push(nome);
		const resp = respinta.filter((n) => n !== nome);
		t = impostaChiave(t, 'approvata_da', approvata);
		if (resp.length !== respinta.length) t = impostaChiave(t, 'respinta_da', resp);
		t = aggiungiRevisione(t, `- ${oggi}, ${nome}: approvo${motivo.trim() ? ` — ${motivo.trim()}` : ''}`);
		const req = richiesti(fm, tipoProgetto);
		const mancano = req.filter((n) => !approvata.includes(n));
		if (!mancano.length && !resp.length) {
			esito = 'approvata';
			t = impostaChiave(t, 'data_approvazione', oggi);
		}
		t = impostaChiave(t, 'approvazione', esito);
		return { testo: t, esito, mancano };
	}

	if (!respinta.includes(nome)) respinta.push(nome);
	t = impostaChiave(t, 'respinta_da', respinta);
	const parola = voto === 'respingo' ? 'respingo' : 'chiedo modifiche';
	t = aggiungiRevisione(t, `- ${oggi}, ${nome}: ${parola} — ${motivo.trim()}`);
	esito = voto === 'respingo' && nome === DIRETTORE ? 'respinta' : 'da rivedere';
	t = impostaChiave(t, 'approvazione', esito);
	return { testo: t, esito, mancano: [] };
}

/** Link Obsidian alla nota, con il percorso (regola del vault), con `|` scappato per le tabelle. */
export const linkTabella = (percorso, alias) => `[[${percorso.replace(/\.md$/, '')}\\|${alias}]]`;

/** Inserisce una riga in cima alla tabella del Registro (subito sotto `|---|`). */
export function rigaRegistro(testo, { data, cosa, chi, link }) {
	const a_capo = testo.includes('\r\n') ? '\r\n' : '\n';
	const righe = testo.split(/\r?\n/);
	const h = righe.findIndex((r) => /^\|\s*Data\s*\|/.test(r));
	const riga = `| ${data} | approvazione | ${cosa} | ${chi} | ${link} |`;
	if (h < 0 || !/^\|[\s|:-]+\|$/.test(righe[h + 1] ?? '')) {
		return testo.trimEnd() + a_capo + a_capo + riga + a_capo;
	}
	righe.splice(h + 2, 0, riga);
	return righe.join(a_capo);
}

/**
 * Stato.md, sezione "In attesa di approvazione": quando la nota esce dalla revisione
 * toglie il punto che parla solo di lei. Se il punto nomina anche altre note lo lascia
 * e ritorna `daSistemare: true`.
 */
export function aggiornaStato(testo, percorso) {
	const a_capo = testo.includes('\r\n') ? '\r\n' : '\n';
	const righe = testo.split(/\r?\n/);
	const i = righe.findIndex((r) => /^##\s+In attesa di approvazione/i.test(r));
	if (i < 0) return { testo, daSistemare: false };
	const senza = percorso.replace(/\.md$/, '');
	const nome = nomeNota(percorso);
	let daSistemare = false;
	for (let k = i + 1; k < righe.length && !/^##\s/.test(righe[k]); k++) {
		const r = righe[k];
		const links = [...r.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim());
		const mia = links.some((l) => l === senza || l === nome);
		if (!mia) continue;
		if (links.every((l) => l === senza || l === nome)) {
			righe.splice(k, 1);
			k--;
		} else daSistemare = true;
	}
	return { testo: righe.join(a_capo), daSistemare };
}

/** Repo GitHub registrate in Studio/Giochi.md (più il vault). */
export function repoRegistrate(testoGiochi, proprietario, vault) {
	const nomi = new Set([vault]);
	const re = new RegExp(`github\\.com/${proprietario}/([A-Za-z0-9._-]+)`, 'g');
	for (const m of testoGiochi.matchAll(re)) nomi.add(m[1].replace(/\.git$/, '').replace(/[).,]+$/, ''));
	return [...nomi];
}

/** Wikilink in link interni dell'app (`#/nota/<percorso>`) se la nota esiste, altrimenti testo. */
export function wikilinkInMarkdown(md, percorsi) {
	const perNome = new Map();
	for (const p of percorsi) {
		const n = nomeNota(p);
		if (!perNome.has(n)) perNome.set(n, p);
	}
	return md
		.replace(/!\[\[([^\]]+)\]\]/g, (_, d) => `*(allegato: ${d.split('|')[0]})*`)
		.replace(/\[\[([^\]]+)\]\]/g, (_, dentro) => {
			const [dest, alias] = dentro.replace(/\\\|/g, '|').split('|');
			const pulito = dest.split('#')[0].trim();
			const testo = (alias ?? pulito.split('/').pop()).trim();
			const percorso = percorsi.has(`${pulito}.md`) ? `${pulito}.md` : perNome.get(pulito.split('/').pop());
			return percorso ? `[${testo}](#/nota/${encodeURIComponent(percorso)})` : `**${testo}**`;
		});
}
