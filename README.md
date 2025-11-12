# 🎛️ Project Manager Bot (Discord)

> Bot Discord développé par **Lauris** pour la gestion automatisée de projets.  
> Permet de **créer**, **archiver**, **désarchiver** et **supprimer** des projets complets avec salons textuels, vocaux et rôles associés.

---

## 🚀 Fonctionnalités principales

- `/newproject` → Crée automatiquement une structure de projet (catégories, salons, vocal, rôle).
- `/archive` → Archive tous les salons du projet et supprime le vocal + le rôle.
- `/unarchive` → Restaure un projet archivé avec ses salons et recrée le vocal + le rôle.
- `/delete` → Supprime complètement tous les salons et le rôle du projet.

Le bot fonctionne 24/7 grâce à **Railway.app** et est relié à un dépôt **GitHub** pour simplifier la maintenance.

---

## 🧩 Structure du projet

```
project-manager-bot/
│
├── index.js                 # Code principal du bot
├── register-commands.js     # Commandes slash (à exécuter depuis ton Mac)
├── package.json
├── package-lock.json
├── .gitignore               # Ignore node_modules et .env
├── .env                     # Contient les secrets (jamais versionné)
└── .env.example             # Exemple de structure .env
```

---

## ⚙️ Configuration `.env`

Crée un fichier `.env` à la racine du projet :

```
TOKEN=TON_TOKEN_DISCORD
CLIENT_ID=1437967436061085848
GUILD_ID=1436441912562421903

ADMIN_ROLE_ID=1436444769323716831
MEMBERS_ROLE_ID=1436447115378163877

ACTIVE_CATEGORY_NAME=🎛️ PROJETS EN COURS 🎛️
ARCHIVE_CATEGORY_NAME=📦 PROJETS ARCHIVÉS 📦
```

---

## 🧱 Installation locale

```bash
# 1. Cloner le dépôt
git clone https://github.com/masskernel/project-manager-bot.git
cd project-manager-bot

# 2. Installer les dépendances
npm install

# 3. Enregistrer les commandes sur ton serveur Discord
npm run register

# 4. Lancer le bot localement
npm start
```

---

## ☁️ Déploiement sur Railway (gratuit)

1. Crée un compte sur [Railway.app](https://railway.app)
2. Clique **New Project → Deploy from GitHub repo**
3. Choisis ton dépôt **project-manager-bot**
4. Dans **Variables**, ajoute :
   ```
   TOKEN=TON_TOKEN_DISCORD
   CLIENT_ID=...
   GUILD_ID=...
   ADMIN_ROLE_ID=...
   MEMBERS_ROLE_ID=...
   ACTIVE_CATEGORY_NAME=🎛️ PROJETS EN COURS 🎛️
   ARCHIVE_CATEGORY_NAME=📦 PROJETS ARCHIVÉS 📦
   ```
5. Dans **Settings → Deploy → Start Command** : `npm start`
6. Dans **Service Type** : choisis **Worker**
7. Clique **Deploy**

### 🔍 Vérification des logs
Railway → ton service → **Logs**  
Tu dois voir :
```
> project-manager-bot@1.0.0 start
> node index.js
✅ Connecté en tant que Project Manager#XXXX
```

---

## 🔄 Mettre à jour le bot

### A. Mettre à jour le code
```bash
git add .
git commit -m "Fix/feature: <ton message>"
git push
```
> Railway redéploie automatiquement après un push sur `main`.

### B. Mettre à jour les slash commands
(uniquement si tu modifies `register-commands.js`)
```bash
npm run register
```

### C. Modifier les variables Railway
Railway → ton service → **Variables** → mets à jour → redeploy.

---

## 🧠 Commandes disponibles

| Commande | Description |
|-----------|-------------|
| `/newproject <nom>` | Crée un projet complet |
| `/archive <nom>` | Archive un projet |
| `/unarchive <nom>` | Désarchive un projet |
| `/delete <nom>` | Supprime totalement un projet |

---

## 🧾 Notes importantes

- Le **rôle du bot** doit toujours être **au-dessus** des rôles “PROJET — …” dans la hiérarchie Discord.  
- Les **catégories** doivent exister et avoir **exactement** les noms définis dans `.env`.  
- Les permissions des rôles projet incluent :  
  - Envoyer des messages, fichiers, liens, réactions, sondages, fils publics  
  - Parler et vidéo en vocal  
  - Voir les salons et les anciens messages  
  - Épingler des messages  

---

## 🧰 Dépannage rapide

| Problème | Solution |
|-----------|-----------|
| Le bot n’est pas en ligne | Vérifie les logs Railway + TOKEN |
| Les commandes n’apparaissent pas | Lance `npm run register` |
| Une commande renvoie une erreur | Vérifie les noms de catégories & hiérarchie des rôles |
| `/archive` ou `/delete` ne font rien | Le rôle du bot n’a pas les droits suffisants |
| Le bot meurt sans message | Ajoute un handler global d’erreurs (fourni dans index.js) |

---

## 🔒 Sécurité

- **Ne jamais committer** `.env` sur GitHub.  
- Si ton token a été exposé → **regenère-le** dans le Discord Developer Portal.  
- Railway masque automatiquement les logs contenant tes variables.

---

## 🧩 Stack technique

- **Node.js** 18+
- **discord.js** 14.24.2
- **dotenv** 16.6.1
- **Railway** pour l’hébergement
- **GitHub Actions (optionnel)** pour le CI/CD

---

## 🧭 Auteur

👤 **Lauris**  
Créateur & mainteneur du bot  
🎵 Producteur de musique électronique, designer 3D & geek passionné  
📡 Contact : [Discord](https://discord.com) — masskernel

---

## 🧱 Licence

Projet distribué sous la licence **ISC**.

---

> _« Build your own creative tools and let them work for you. »_
