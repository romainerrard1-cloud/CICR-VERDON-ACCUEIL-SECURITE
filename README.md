# Accueil sécurité CICR Verdon

Site publié sur Netlify, mis à jour automatiquement à chaque modification de la branche `main`.

- `/` : accueil sécurité interactif (arrivants, intérimaires).
- `/q.html` : questionnaires de suivi (1 mois arrivant, 1 mois parrain, 3 mois).
- `/sse/` : espace SSE, protégé par code d'accès.
- `netlify/functions/api.mts` : enregistrement des accueils, dossiers et réponses (Netlify Blobs).

Variables d'environnement Netlify : `SSE_PASSWORD` (code de l'espace SSE), `SSE_SECRET` (clé de session), `BREVO_API_KEY` (envoi automatique des mails), `MAIL_FROM` (expéditeur validé dans Brevo, par défaut rerrard@groupe-verdon.com).

`netlify/functions/relances.mts` envoie chaque matin les questionnaires dus (1 mois, 3 mois).
