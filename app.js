import { GitHub } from './lib/github.js';
import {
	leggiFrontmatter, corpo, candidata, progettoDi, notaPrincipale, nomeNota, richiesti,
	applicaVoto, rigaRegistro, aggiornaStato, linkTabella, repoRegistrate, wikilinkInMarkdown,
} from './lib/approva.js';

const vista = document.getElementById('vista');
const CHIAVE_CONF = 'bm-mobile-config';
const CHIAVE_CACHE = 'bm-mobile-fm';
const PREDEFINITI = { token: '', nome: 'Andrea Bianchini', proprietario: 'Lisard95', vault: 'light-blue-labs', branch: 'main' };

// --- archivio locale (può mancare: finestra privata, dati cancellati) ---
function leggi(chiave, def) {
	try { return JSON.parse(localStorage.getItem(chiave)) ?? def; } catch { return def; }
}
function salva(chiave, v) {
	try { localStorage.setItem(chiave, JSON.stringify(v)); } catch { /* niente archivio: si rilegge da GitHub */ }
}
const conf = () => ({ ...PREDEFINITI, ...leggi(CHIAVE_CONF, {}) });
const gh = () => new GitHub(conf());

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const classeStato = (s) => String(s ?? '').replace(/\s+/g, '-');
const oggi = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-GG nell'ora locale
const quando = (iso) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let timerAvviso;
function avviso(testo, errore = false) {
	const el = document.getElementById('avviso');
	el.textContent = testo;
	el.className = errore ? 'errore' : '';
	el.hidden = false;
	clearTimeout(timerAvviso);
	timerAvviso = setTimeout(() => { el.hidden = true; }, errore ? 8000 : 4000);
}

// --- indice delle note con approvazione ---
let indice = null; // { testa, percorsi:Set, note:[{ path, fm, tipo }] }

async function caricaIndice(forza = false) {
	if (indice && !forza) return indice;
	const g = gh();
	const testa = await g.testa();
	const file = await g.albero(testa);
	const percorsi = new Set(file.map((f) => f.path));
	const cand = file.filter((f) => candidata(f.path));
	const cache = leggi(CHIAVE_CACHE, {});
	const mancanti = cand.filter((f) => !(f.sha in cache)).map((f) => f.sha);
	if (mancanti.length) {
		const testi = await g.blob(mancanti);
		for (const [sha, t] of Object.entries(testi)) {
			const fm = leggiFrontmatter(t);
			cache[sha] = {
				approvazione: fm.approvazione ?? null, approvata_da: fm.approvata_da ?? [], respinta_da: fm.respinta_da ?? [],
				approvatori: fm.approvatori ?? null, tipo: fm.tipo ?? null, data_approvazione: fm.data_approvazione ?? null,
			};
		}
	}
	const vivi = {};
	for (const f of cand) vivi[f.sha] = cache[f.sha];
	salva(CHIAVE_CACHE, vivi);
	const perPercorso = Object.fromEntries(cand.map((f) => [f.path, vivi[f.sha]]));
	const note = cand
		.filter((f) => vivi[f.sha]?.approvazione)
		.map((f) => ({ path: f.path, fm: vivi[f.sha], tipo: perPercorso[notaPrincipale(progettoDi(f.path))]?.tipo ?? 'gioco' }));
	indice = { testa, percorsi, note };
	return indice;
}

function persone(fm, tipo) {
	const req = richiesti(fm, tipo);
	const si = new Set(fm.approvata_da ?? []);
	const no = new Set(fm.respinta_da ?? []);
	const tutti = [...new Set([...req, ...si, ...no])];
	return `<div class="persone">${tutti.map((n) => {
		const c = no.has(n) ? 'no' : si.has(n) ? 'si' : '';
		const segno = no.has(n) ? '✗ ' : si.has(n) ? '✓ ' : '';
		return `<span class="persona ${c}">${segno}${esc(n)}</span>`;
	}).join('')}</div>`;
}

function schedaNota(n) {
	return `<a class="scheda" href="#/nota/${encodeURIComponent(n.path)}">
		<strong>${esc(nomeNota(n.path))}</strong>
		<span class="meta">${esc(progettoDi(n.path))} · <span class="stato ${classeStato(n.fm.approvazione)}">${esc(n.fm.approvazione)}</span></span>
		${n.fm.approvazione === 'in revisione' ? persone(n.fm, n.tipo) : ''}
	</a>`;
}

// --- viste ---
async function vistaLista() {
	vista.innerHTML = `<div class="riga-titolo"><h1>Design</h1><button class="piccolo" id="ricarica">↻ Aggiorna</button></div><p class="vuoto">Leggo il vault…</p>`;
	document.getElementById('ricarica').onclick = () => { indice = null; vistaLista(); };
	const { note } = await caricaIndice();
	const gruppi = [
		['Da approvare', note.filter((n) => n.fm.approvazione === 'in revisione'), 'Niente in revisione.'],
		['Da rivedere', note.filter((n) => n.fm.approvazione === 'da rivedere'), 'Niente da rivedere.'],
		['Approvate di recente', note.filter((n) => n.fm.approvazione === 'approvata')
			.sort((a, b) => String(b.fm.data_approvazione ?? '').localeCompare(String(a.fm.data_approvazione ?? ''))).slice(0, 8), 'Nessuna.'],
		['Bozze', note.filter((n) => n.fm.approvazione === 'bozza'), 'Nessuna.'],
	];
	vista.querySelector('.vuoto').remove();
	vista.insertAdjacentHTML('beforeend', gruppi.map(([titolo, lista, vuoto]) =>
		titolo === 'Bozze'
			? `<details><summary><h2 style="display:inline">${titolo} (${lista.length})</h2></summary>${lista.map(schedaNota).join('') || `<p class="vuoto">${vuoto}</p>`}</details>`
			: `<h2>${titolo} (${lista.length})</h2>${lista.map(schedaNota).join('') || `<p class="vuoto">${vuoto}</p>`}`,
	).join(''));
}

async function vistaNota(percorso) {
	vista.innerHTML = `<p class="vuoto">Apro la nota…</p>`;
	const idx = await caricaIndice();
	const g = gh();
	const testo = await g.testo(percorso, idx.testa);
	const fm = leggiFrontmatter(testo);
	const progetto = progettoDi(percorso);
	const tipo = idx.note.find((n) => n.path === percorso)?.tipo ?? 'gioco';
	const md = wikilinkInMarkdown(corpo(testo), idx.percorsi);
	const html = globalThis.marked.parse(md, { gfm: true, breaks: false });
	const inRevisione = fm.approvazione === 'in revisione';
	vista.innerHTML = `
		<p class="meta"><a href="#/">← Design</a> · ${esc(progetto)}</p>
		<h1>${esc(nomeNota(percorso))}</h1>
		${fm.approvazione ? `<span class="stato ${classeStato(fm.approvazione)}">${esc(fm.approvazione)}</span>` : ''}
		${fm.approvazione ? persone(fm, tipo) : ''}
		<article class="nota">${html}</article>
		${inRevisione ? `
		<div class="voto">
			<textarea id="motivo" rows="2" placeholder="Motivo (obbligatorio per modifiche o rifiuto)"></textarea>
			<div class="bottoni">
				<button class="verde" data-voto="approvo">Approvo</button>
				<button class="arancio" data-voto="modifiche">Modifiche</button>
				<button class="rosso" data-voto="respingo">Respingo</button>
			</div>
			<p class="aiuto">Voti come <b>${esc(conf().nome)}</b>. Il commit va su <code>${esc(conf().branch)}</code> del vault.</p>
		</div>` : ''}
		<p class="meta"><a href="https://github.com/${esc(conf().proprietario)}/${esc(conf().vault)}/blob/${esc(conf().branch)}/${percorso.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">Apri su GitHub</a></p>`;
	for (const b of vista.querySelectorAll('[data-voto]')) b.onclick = () => vota(percorso, b.dataset.voto);
}

const PAROLE = { approvo: 'Approvi', modifiche: 'Chiedi modifiche a', respingo: 'Respingi' };

async function vota(percorso, voto, tentativo = 1) {
	const motivo = document.getElementById('motivo')?.value ?? '';
	if (voto !== 'approvo' && !motivo.trim()) { avviso('Scrivi il motivo.', true); return; }
	if (tentativo === 1 && !confirm(`${PAROLE[voto]} "${nomeNota(percorso)}"?`)) return;
	const bottoni = vista.querySelectorAll('[data-voto]');
	bottoni.forEach((b) => { b.disabled = true; });
	try {
		const c = conf();
		const g = gh();
		const testa = await g.testa();
		const progetto = progettoDi(percorso);
		const pReg = `Progetti/${progetto}/Registro.md`;
		const pStato = `Progetti/${progetto}/Stato.md`;
		const [testo, principale, registro, stato] = await Promise.all([
			g.testo(percorso, testa),
			g.testo(notaPrincipale(progetto), testa).catch(() => ''),
			g.testo(pReg, testa).catch(() => null),
			g.testo(pStato, testa).catch(() => null),
		]);
		const tipo = leggiFrontmatter(principale).tipo ?? 'gioco';
		const r = applicaVoto({ testo, voto, nome: c.nome, motivo, oggi: oggi(), tipoProgetto: tipo });
		const nome = nomeNota(percorso);
		const verbo = { approvo: 'approva', modifiche: 'chiede modifiche', respingo: 'respinge' }[voto];
		let cosa = `${nome}: ${c.nome} ${verbo}; esito ${r.esito}`;
		if (r.esito === 'in revisione' && r.mancano.length) cosa += ` (mancano ${r.mancano.join(', ')})`;
		if (voto !== 'approvo') cosa += ` — ${motivo.trim().replace(/\|/g, '/').replace(/\s+/g, ' ')}`;
		const file = [{ path: percorso, testo: r.testo }];
		if (registro != null) file.push({ path: pReg, testo: rigaRegistro(registro, { data: oggi(), cosa, chi: c.nome, link: linkTabella(percorso, nome) }) });
		let daSistemare = false;
		if (stato != null && r.esito !== 'in revisione') {
			const s = aggiornaStato(stato, percorso);
			daSistemare = s.daSistemare;
			if (s.testo !== stato) file.push({ path: pStato, testo: s.testo });
		}
		const corpoCommit = [`- ${cosa}`, `- ${file.map((f) => f.path).join(', ')}`, '- dal telefono (Blue Mind mobile)'].join('\n');
		await g.commit({ testaAttesa: testa, titolo: `Approvazione: ${nome} (${c.nome})`, corpo: corpoCommit, file });
		indice = null;
		avviso(`Fatto: ${r.esito}.${daSistemare ? ' In Stato.md la nota è citata insieme ad altre: sistemala dal PC.' : ''}`);
		await vistaNota(percorso);
	} catch (e) {
		if (tentativo < 2 && /expectedHeadOid|expected branch|head oid/i.test(e.message)) return vota(percorso, voto, 2);
		avviso(e.message, true);
		bottoni.forEach((b) => { b.disabled = false; });
	}
}

async function vistaPush() {
	vista.innerHTML = `<div class="riga-titolo"><h1>Push recenti</h1><button class="piccolo" id="ricarica">↻ Aggiorna</button></div><p class="vuoto">Leggo le repo…</p>`;
	document.getElementById('ricarica').onclick = vistaPush;
	const c = conf();
	const g = gh();
	const giochi = await g.testo('Studio/Giochi.md').catch(() => '');
	const repo = repoRegistrate(giochi, c.proprietario, c.vault);
	const risultati = await Promise.allSettled(repo.map((r) => g.push(r)));
	const errori = risultati.map((x, i) => (x.status === 'rejected' ? `${repo[i]}: ${x.reason.message}` : null)).filter(Boolean);
	const push = risultati.flatMap((x) => (x.status === 'fulfilled' ? x.value : []))
		.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 30);
	// Gli eventi recenti di GitHub possono non avere l'elenco dei commit: leggo almeno l'ultimo.
	await Promise.all(push.slice(0, 15).filter((p) => !p.commit.length && p.testa).map(async (p) => {
		p.commit = [await g.messaggioCommit(p.repo, p.testa).catch(() => '')].filter(Boolean);
	}));
	vista.querySelector('.vuoto').remove();
	vista.insertAdjacentHTML('beforeend', `
		<p class="meta">Repo seguite: ${repo.map(esc).join(', ')}</p>
		${push.map((p) => `<a class="scheda push" href="https://github.com/${esc(c.proprietario)}/${esc(p.repo)}/commit/${esc(p.testa)}" target="_blank" rel="noopener">
			<strong>${esc(p.repo)} · ${esc(p.branch)}</strong>
			<span class="meta">${esc(p.chi)} · ${esc(quando(p.quando))}${p.quanti ? ` · ${p.quanti} commit` : ''}</span>
			<ul class="commit">${p.commit.slice(0, 5).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
		</a>`).join('') || '<p class="vuoto">Nessun push recente.</p>'}
		${errori.length ? `<p class="aiuto">Non lette: ${errori.map(esc).join('<br>')}</p>` : ''}`);
}

function vistaImpostazioni() {
	const c = conf();
	vista.innerHTML = `
		<h1>Impostazioni</h1>
		<form id="form">
			<label for="token">Token GitHub</label>
			<input id="token" type="password" autocomplete="off" value="${esc(c.token)}" placeholder="github_pat_…">
			<p class="aiuto">Token fine-grained di ${esc(c.proprietario)}: repo del vault con <b>Contents: read and write</b>, le altre repo seguite con <b>Contents: read</b>. Resta solo su questo telefono.</p>
			<label for="nome">Voti come</label>
			<input id="nome" value="${esc(c.nome)}">
			<label for="proprietario">Account GitHub</label>
			<input id="proprietario" value="${esc(c.proprietario)}">
			<label for="vault">Repo del vault</label>
			<input id="vault" value="${esc(c.vault)}">
			<label for="branch">Branch delle approvazioni</label>
			<input id="branch" value="${esc(c.branch)}">
			<p class="aiuto">Le notifiche dei push arrivano su Telegram dal bot di Blue Mind; il bottone del messaggio apre questa app.</p>
			<p style="display:flex;gap:8px;margin-top:18px"><button class="primario" type="submit">Salva</button><button type="button" id="prova">Prova il token</button></p>
		</form>`;
	const valori = () => Object.fromEntries(['token', 'nome', 'proprietario', 'vault', 'branch'].map((k) => [k, document.getElementById(k).value.trim()]));
	document.getElementById('form').onsubmit = (e) => {
		e.preventDefault();
		salva(CHIAVE_CONF, valori());
		indice = null;
		avviso('Salvato.');
		location.hash = '#/';
	};
	document.getElementById('prova').onclick = async () => {
		const v = valori();
		try {
			const g = new GitHub(v);
			const r = await g.rest(`/repos/${v.proprietario}/${v.vault}`);
			avviso(r.permissions?.push ? 'Token valido, può scrivere nel vault.' : 'Token valido ma senza scrittura sul vault.', !r.permissions?.push);
		} catch (e) { avviso(e.message, true); }
	};
}

// --- navigazione ---
async function vai() {
	const h = location.hash || '#/';
	const nome = h.startsWith('#/push') ? 'push' : h.startsWith('#/impostazioni') ? 'impostazioni' : 'lista';
	for (const a of document.querySelectorAll('nav a')) a.classList.toggle('attiva', a.dataset.vista === nome);
	if (!conf().token && nome !== 'impostazioni') { location.hash = '#/impostazioni'; return; }
	try {
		if (h.startsWith('#/nota/')) await vistaNota(decodeURIComponent(h.slice(7)));
		else if (nome === 'push') await vistaPush();
		else if (nome === 'impostazioni') vistaImpostazioni();
		else await vistaLista();
		window.scrollTo(0, 0);
	} catch (e) {
		vista.innerHTML = `<p class="vuoto">Non riesco a leggere GitHub.</p><p class="aiuto">${esc(e.message)}</p><p><a href="#/impostazioni">Controlla le impostazioni</a></p>`;
	}
}
addEventListener('hashchange', vai);
document.addEventListener('visibilitychange', () => { if (!document.hidden && (location.hash || '#/') === '#/') { indice = null; vai(); } });
vai();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
