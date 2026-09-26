# Dino Escape

Runner 3D : le dino de la page « Pas de connexion » s'enfuit du navigateur en courant, poursuivi
par un curseur géant qui veut fermer l'onglet. Route procédurale (virages serrés, dénivelé), armes,
boss, boutique (skins, musiques, améliorations) et musique générée en direct par Google DeepMind Lyria.

## Lancer
    npm install
    npm run dev        # http://localhost:5173 (accessible sur le réseau local pour tester sur mobile)

## Contrôles
- ← / → (ou A/Q, D) : se décaler
- ESPACE / ↑ : sauter
- SHIFT (en tournant) : glissade ; relâcher = sprint (bleu, puis orange si chargé)
- ↓ : freiner
- Mobile : moitié gauche/droite de l'écran, glisser vers le haut = saut, deux doigts = glissade

## Publier sur itch.io
    npm run zip        # crée dino-escape-itch.zip
Sur itch.io : Kind of project = HTML, uploader le zip, cocher « This file will be played in the browser »,
viewport 1280×720, activer « Fullscreen button » et « Mobile friendly ».

## Tests
    npm test           # tests du kernel (sans navigateur)

## Architecture
Voir **[ARCHITECTURE.md](ARCHITECTURE.md)** : kernel / vues / contenu, liste des événements, et comment
ajouter un ennemi, un boss, une arme, un skin (y compris un .glb), une musique ou une amélioration.

## Où régler quoi
- `src/kernel/config.js` : physique du dino (`RUNNER`), règles (`GAME`), route (`TRACK`), rythme (`DIRECTOR`)
- `src/content/` : zones, ennemis, armes, boss, skins, musiques, boutique
- `src/view/models/` : apparence de chaque entité et du dino

## Musique Lyria
Menu 🎵 MUSIQUE → saisir une clé API Gemini (https://aistudio.google.com/apikey). Sans clé, un synthé
procédural prend le relais. En dev, on peut aussi mettre `VITE_GEMINI_API_KEY=...` dans `.env.local`
(jamais dans un build publié).
