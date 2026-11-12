# Blue Mind mobile — istruzioni per gli agenti

PWA statica (GitHub Pages) per rivedere e approvare dal telefono il design del vault Light Blue Labs. Strumento interno dello studio: niente approvazione del team. Guida d'uso e notifiche: `README.md`; nel vault: `Strumenti/blue-mind/LEGGIMI.md` (sezione "Telefono") — dalla repo il vault è `../../`.

- Niente build e niente dipendenze npm in esecuzione: HTML, CSS e moduli ES serviti così come sono. `vendor/marked.min.js` è marked 12.0.2 copiato a mano.
- La logica dell'approvazione sta in `lib/approva.js` (senza rete né DOM) e segue la skill `approvazione` del vault (`../../.agents/skills/approvazione/SKILL.md`) e la tabella "Approvazione degli elementi" di `Studio/Organigramma.md`. Ogni modifica lì ha un test in `test/approva.test.js`: `npm test` verde prima di dichiarare finito. Se cambia la regola nel vault, cambia anche qui.
- `lib/github.js`: API di GitHub. I voti sono un solo commit (`createCommitOnBranch`) su nota, `Registro.md` e `Stato.md`, con `expectedHeadOid`: niente scritture a metà.
- Mai segreti nella repo: è pubblica. Il token sta nel `localStorage` del telefono; il topic ntfy nel file locale del vault `Strumenti/blue-mind/notifiche.local.json`.
- Quando cambi i file del guscio, aumenta `CACHE` in `sw.js`.
- Testi dell'interfaccia in italiano.
