# Comment World of Bagarre décrit ses personnages

Référence lue dans le code du jeu (version `ef16a76`, 12 nov. 2026). Le jeu tourne à **60 images (frames) par seconde** ; les distances sont en **mètres**, les dégâts en **%**.

## Où sont les données

- Code servi par `https://worldofbagarre.com/v/<commit>/src/`. Le `<commit>` change à chaque mise à jour : c'est le numéro de version.
- Un fichier par perso : `src/sim/chars/<id>.js` (la première vague) ou `src/sim/chars/stars/<id>.js` (le « mercato des stars »).
- `src/sim/chars/index.js` les rassemble dans `CHARS`, puis **modifie tout le monde** avant le combat. Il faut donc lire le résultat final, pas les fichiers bruts :
  1. `applyArchetypes` : chaque perso bouge comme son modèle de Smash Ultimate (`arch`, ex. `mario`).
  2. `applySpecialTuning` : délais de recharge des spéciaux, plafonds.
  3. `applyReachFit` : la portée des coups normaux recalée sur les membres du modèle 3D.
  4. `applyUlts` : un ultime pour ceux qui n'en ont pas.
- `CHAR_ORDER` = les persos jouables (75). Quelques persos existent mais sont retirés de la sélection (`frog`, `bubba`, `pika`, `catlady`).

## Un perso (objet `CHARS[id]`)

| Champ | Sens |
|---|---|
| `id`, `name`, `title`, `color` | identifiant, nom affiché, sous-titre, couleur |
| `arch` | l'archétype Smash qu'il imite (mouvements) |
| `stats` | les chiffres de déplacement (tableau plus bas) |
| `moves` | tous les coups (plus bas) |
| `specialsInfo` | les noms des spéciaux par le créateur : `n` (B), `s` (B côté), `u` (B haut), `d` (B bas), et `p` = **le passif** quand il y en a un |
| `ult` | l'ultime : `name`, `sub`, `final` (le dernier coup : dmg, ang, kbb, kbg), `notes` × `noteDmg` (les petits coups avant) |
| `recovery` | réglages de la remontée |
| `tick` | du **code** appelé à chaque image : c'est là que vivent les passifs (jauges, bonus, états) |
| `hitMul`, `kbMul` | du code qui multiplie ses dégâts / son éjection (bonus conditionnels) |
| `takenMul` | du code qui réduit les dégâts qu'il **reçoit** (ex. LE MAÏZ) |
| `onDealt` | du code appelé quand il touche (ex. jauge de LA GRÈVE) |
| `cooldown`, `oneOut` | limites d'utilisation de certains spéciaux |
| `duo`, `solo`, `forms`, `disguise` | cas spéciaux (BIGO & FOLI, transformations, imposteur) |
| `bot`, `winLine` | réglages de l'ordinateur, phrase de victoire |

Le **commentaire en tête du fichier** (`// …`) décrit le perso et son moveset en français : c'est la description du créateur.

## Les stats (`stats`)

| Champ | Sens |
|---|---|
| `weight` | poids : plus il est lourd, moins il est éjecté (MISTER Y = 98) |
| `runSpeed`, `walkSpeed`, `dashSpeed`, `dashFrames` | vitesses au sol (m/s), durée du dash initial |
| `airSpeed`, `airAccel`, `groundAccel`, `friction` | vitesse et accélération en l'air / au sol, adhérence |
| `jumpVel`, `airJumpVel`, `airJumps`, `shortHop` | puissance du saut, du saut en l'air, nombre de sauts en l'air, petit saut |
| `gravity`, `fallSpeed`, `ffMul` | gravité, vitesse de chute max, multiplicateur de chute rapide |
| `landHard` | images bloquées après un atterrissage brutal |
| `height`, `radius` | taille du corps |
| `dodge`, `archetype` | réglages d'esquive, rappel de l'archétype |

## Les coups (`moves`)

Clés toujours présentes : `jab1` `jab2` `jab3` (+ `jab4`/`jab5` parfois), `ftilt` (+ `ftilt2`, `ftilt3` pour les enchaînements), `utilt`, `dtilt`, `smash` (smash avant), `usmash`, `dsmash`, `dashattack`, `nair`, `fair`, `bair`, `uair`, `dair`, `grab`, `throw`, `ledgeattack`, **`sp_n` `sp_s` `sp_u` `sp_d`** (les spéciaux), `ult_a` `ult_b` `ult_c` (l'ultime). Les autres clés (`insulin`, `bee`, `ppSave`…) sont des morceaux de spéciaux propres à un perso.

| Champ d'un coup | Sens |
|---|---|
| `dur` | durée totale en images |
| `iasa` | image à partir de laquelle on peut rejouer (sinon `dur`) |
| `landLag` | images bloquées si on atterrit pendant le coup (aériens) |
| `hits` | la liste des zones de frappe (tableau plus bas) |
| `charge` | coup chargeable (smashs) : `max` images de charge |
| `next`, `nextWin` | enchaînement (jab1 → jab2) et la fenêtre pour l'enchaîner |
| `onFrame`, `onStart`, `onEnd`, `onLand` | **du code** : tout ce qui n'est pas une simple frappe (projectiles, pièges, invocations…). C'est le cas de la plupart des spéciaux |
| `air`, `groundOnly`, `airOnce`, `helpless`, `upUses` | où il se lance, une seule fois en l'air, chute sans défense après, nombre d'utilisations du B haut |
| `airCtrl`, `vel`, `groundFric`, `noGrav` | contrôle et mouvement pendant le coup |
| `whiffLag` | images en plus si le coup rate |
| `cdOwn` | délai de recharge propre (images) |

## Les spéciaux en particulier (`sp_n`, `sp_s`, `sp_u`, `sp_d`)

Sur les 300 spéciaux des 75 persos :

- **299 sont du code** (`onFrame`, souvent avec `onStart` / `onEnd`) : ils lancent des projectiles, posent des objets, invoquent, changent d'état. **124** ont aussi des zones de frappe lisibles (`hits`), les **177** autres n'en ont aucune : tout passe par le code.
- Ce qu'ils posent sur le terrain sont des **entités** (`src/sim/entities.js` → `ENTITIES`, 180 sortes : `proj` projectile, `ring`, `cloud`, `puddle` flaque, `minion` invocation, `boomerang`, `marker`…). Chaque perso peut ajouter les siennes (`ENTITIES.mysFrozen = { … }` dans son fichier) avec leur propre `onHitFighter`. Les outils communs sont dans `kit.js` (`shoot`, `fwd`…) et `W.spawn(kind, props)`, `W.addHit({ dmg, ang, kbb, kbg, … })` pour frapper depuis le code.
- **Pas de délai de recharge** (le tableau `SPECIAL_TUNING` n'est plus lu pour les délais, comme dans Ultimate) : la limite, c'est `oneOut` (pas de nouvelle copie tant que la précédente est sur le terrain) et `airOnce` (une fois par saut). `poke: true` = projectile plafonné à `POKE` (3 %, faible éjection).
- **B haut** : `helpless` (chute sans défense après), `upUses` (plusieurs utilisations en l'air), `airCtrl` (contrôle pendant la montée).
- Les **noms** et le **passif** sont dans `specialsInfo` (`n`, `s`, `u`, `d`, `p`).

Le robot les **lance vraiment** dans la simulation (`startMove(perso, monde, 'sp_x')`) et relève : dégâts sur 6 s, image de la première touche, portée max (1 à 13 m), KO %, plus ce que la fiche dit (`dur`, `iasa`, `oneOut`, `airOnce`, `helpless`, `poke`, `charge`, `upUses`) et, pour le B haut, **la hauteur gagnée** en partant immobile en l'air. Limites : une seule pression (rien de maintenu ni chargé), aucun pilotage (le balai d'EPEKTASE, la fusée de JOLAVERT montent peu sans être dirigés), le hasard (dé de LIDRA) tiré toujours pareil.

## Une zone de frappe (`hits[]`) — fabriquée par `hb(f0, f1, at, r, dmg, ang, kbb, kbg, extra)`

| Champ | Sens |
|---|---|
| `f` | `[première, dernière]` image où la zone est active : **f[0] = l'image où le coup sort** |
| `at` | position par rapport au perso `[côté, hauteur, devant]` en m |
| `r` | rayon de la zone (m) |
| `dmg` | dégâts (%) |
| `ang` | angle d'éjection en degrés ; **négatif = météore** (vers le bas) |
| `kbb` | éjection de base (la même à 0 % qu'à 200 %) |
| `kbg` | croissance de l'éjection avec les % (100 = normal) |
| `grp` | les zones du même groupe ne touchent qu'une fois (zone forte / zone faible du même coup) |
| `dir` | sens de l'éjection : `face` (devant le perso), `away`, `radial`, `in`, `center`, `vel` |
| `back` | frappe derrière |
| `hitlag` | multiplicateur du gel à l'impact |
| `link` | garde la victime devant (enchaînements de jab) |
| `spike` | météore |
| `rehit` | coup multiple : images entre deux touches |
| `effect` | `grab` (chope) ou `stun` (étourdit, durée `stun`) |
| `fkb` | éjection fixe (ignore les %) |
| `drag` | attire la victime |
| `noLaunch`, `noFlinch`, `shieldMul` | ne fait pas décoller / ne fait pas broncher / dégâts au bouclier |
| `sfx`, `blood`, `fx` | son, sang, effet visuel (affichage seulement) |

## Les formules du jeu

- **Éjection** (`world.js knockback`, comme Smash) :
  `kb = ((p/10 + p·dmg/20) · 200/(poids+100) · 1,15 + 18) · kbg/100 + kbb`
  avec `p` = % de la victime **après** le coup. Accroupi : ×0,85.
- **Smash chargé** : dégâts × (1 + 0,45 × charge), `kbb` × (1 + 0,27 × charge), charge de 0 à 1.
- **KO** : la victime sort de la zone (`BLAST.side` sur les côtés, `BLAST.top` en haut, `BLAST.bottom` en bas).
- **Bonus** : `hitMul`, `kbMul`, `takenMul` et le bonus « sur le temps » (`beatBonus` : ×1,25) s'appliquent au moment de la touche.

## Ce que le robot en tire (`scripts/extract.mjs`)

- **Coups normaux** : lus dans les données (`f[0]`, dégâts, `iasa`, `landLag`), **KO %** par simulation (le coup le plus fort sur MISTER Y au centre de la salle d'entraînement, sans DI, KO par le côté ou le haut seulement).
- **Spéciaux** : ce sont du code, donc le perso les **lance vraiment** dans la simulation, à 7 distances (1 à 13 m), 6 secondes, et on garde le meilleur résultat.
- **Textes** : `specialsInfo` (dont le passif), `ult`, la description en tête de fichier.

**Ce qu'on ne peut pas lire sans simuler** : tout ce qui est dans `tick`, `onFrame`, `hitMul`/`kbMul`/`takenMul` (passifs, bonus conditionnels, projectiles, pièges). Les chiffres « bruts » d'un coup ne disent rien de ces bonus.
