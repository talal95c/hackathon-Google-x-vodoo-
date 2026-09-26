# Dino Escape

Runner 3D : le dino de la page « Pas de connexion » s'enfuit du navigateur en courant, poursuivi
par un curseur géant qui veut fermer l'onglet. Route procédurale (virages serrés, dénivelé), armes,
boss, boutique (skins, musiques, améliorations) et musique générée en direct par Google DeepMind Lyria.

## Dino reggae et rendu

- **Riddim**, le dino reggae low poly, est disponible dès le départ. Le bouton « Dino reggae »
  l'équipe aussi sur les anciennes sauvegardes, sans effacer la progression.
- Son thème Reggae est inclus tant qu'il est équipé ; les autres thèmes et achats restent disponibles.
- Cinq mondes : désert hors ligne, navigateur, Windows, hardware, cloud. Cactus et mesas,
  onglets et pop-ups, dossiers du bureau, circuits et ventilateurs, serveurs sur les nuages.
- Tous les 720 m, un saut guidé franchit un portail vers le monde suivant. Le contrôle revient
  à l'atterrissage ; les zones de départ et d'arrivée sont dégagées. Le cloud se poursuit à l'infini.
- Néons réactifs au rythme, décors fusionnés par matériau et libérés derrière le joueur.
- Rendu : éclairages cyan/corail, faisceaux animés, sculptures de données, matériaux réfléchissants,
  variantes de décors par monde. Post-traitement : ombres de contact GTAO sur ordinateur, bloom HDR,
  contraste coloré, grain fin, vignette et décomposition chromatique pendant les sprints et portails, tone mapping ACES
  et anticrénelage MSAA. La résolution est plafonnée pour limiter le coût sur mobile.
- Le jury saisit sa propre clé Gemini dans le menu Musique. Aucun relais serveur n'est nécessaire.

## Lancer
    npm install
    npm run dev        # http://localhost:5173 (accessible sur le réseau local pour tester sur mobile)

## Contrôles
- ← / → (ou A/Q, D) : se décaler
- ESPACE / ↑ : sauter
- SHIFT (en tournant) : glissade ; relâcher = sprint (bleu, puis orange si chargé)
- ↓ : freiner
- F : parer un bloc violet à proximité (fenêtre de 0,14 s)
- Mobile : moitié gauche/droite de l'écran, glisser vers le haut = saut, deux doigts = glissade, tap bref = parade

Les pièces remplissent la jauge de Frénésie : pendant 6 secondes, le dino écrase les obstacles
sur la route, mais peut toujours tomber. Certaines sections proposent une voie sûre avec des
pièces normales et une voie en bord de piste avec des pièces dorées. Le menu Défis permet de
sélectionner un objectif facultatif par course, sans limite de temps.
Dans le même menu, la série quotidienne attribue 10 à 70 pièces selon les jours consécutifs
(remise au jour 1 après une absence, calendrier UTC). Le défi éclair, à activer librement une fois
par jour, donne 35 pièces dès que 12 pièces sont ramassées dans une partie avant la fin de ses 10 minutes.

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
