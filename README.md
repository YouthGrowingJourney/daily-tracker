# YGJ Daily Tracker

Täglicher Tracker von **Youth Growing Journey** – ohne Accounts, ohne Server, ohne Speicherung.

**Live:** https://youthgrowingjourney.github.io/daily-tracker/

## Inhalt

1. **Journal** – acht Fragen, zusammen max. 1.000 Zeichen
2. **Gratitude** – je drei Punkte: dankbar für, heute gut gemacht, könnte besser laufen
3. **Today in numbers** – Bildschirmzeit, Gym (Dauer / Rest day / Skipped), Meditation (Ja + Dauer / Nein)
4. **Tomorrow** – Ideen und Pläne für den nächsten Tag (max. 500 Zeichen)
5. **Rate your day** – Produktivität von 1 bis 10
6. **Export** – PNG (1080 px breit, mind. 1920 px hoch) mit Datum, Wochentag und allen Angaben im Stil der YGJ-Posts

## Datenschutz

- Keine Accounts, keine Cookies, kein Tracking, keine Speicherung (auch nicht im Browser).
- Die Eingaben existieren nur im offenen Tab. Beim Schließen oder Neuladen sind sie weg; vorher warnt der Browser.
- Schriften (Lora, Bebas Neue, beide SIL Open Font License) liegen im Repo – es gehen keine Anfragen an Google.

## Branding

- Farben: `#333333` und `#E0C280` plus die Abstufungen aus der YGJ-App
- Schriften: Lora (Text), Bebas Neue (Headlines, wie in den Instagram-Posts)
- Logo: Original-Logo in Gold (`assets/logo-gold.png`)

## Aufbau

| Datei | Zweck |
|---|---|
| `index.html` | Seite und Formular |
| `styles.css` | Design (Tokens wie in der App) |
| `app.js` | Formularlogik, Zeichenbudget, Fortschritt, Export-Dialog |
| `export.js` | Zeichnet das Export-Bild auf ein Canvas |
| `impressum.html` | Impressum (Betreiber und Kontakt) |
| `datenschutz.html` | Datenschutzerklärung (Hosting über GitHub Pages, keine Speicherung) |

Reines HTML/CSS/JS ohne Build-Schritt. Lokal testen, z. B. mit:

```bash
npx serve .
```

Deployment: GitHub Pages aus dem Branch `main` (Ordner `/`).
