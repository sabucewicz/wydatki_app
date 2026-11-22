# Wydatki miesięczne / Monthly Expense Tracker (PWA)

Prosta, szybka aplikacja PWA do kontroli miesięcznego budżetu w kategoriach — działa całkowicie lokalnie w przeglądarce (`localStorage`) oraz offline dzięki Service Workerowi.

Live demo: [sabucewicz.github.io/wydatki_app](https://sabucewicz.github.io/wydatki_app/)

## Funkcje (PL)

- **Podsumowanie miesiąca** — łączna pozostała kwota, wykorzystany procent budżetu i pasek postępu.
- **Kategorie i limity** — dodawanie i usuwanie kategorii, edycja miesięcznych limitów na bieżąco oraz wizualna sygnalizacja wykorzystania budżetu.
- **Historia wydatków i Cofnij** — wpisy z opcjonalną notatką, datą oraz możliwością cofnięcia usunięcia lub resetu miesiąca.
- **Eksport do CSV** — pobieranie zestawienia wydatków w formacie zgodnym z arkuszami kalkulacyjnymi (UTF-8 BOM, separator `;`, ochrona przed CSV formula injection).
- **Offline-first & prywatność** — brak backendu i trackerów; wszystkie dane zostają na urządzeniu (z automatyczną migracją ze starszej wersji opartej na cookies).

## Features (EN)

- **Monthly Budget Summary** — overall remaining balance, spent/budget breakdown, and progress indicators.
- **Category Management** — custom categories with inline monthly limit editing, icons, and warning/danger thresholds.
- **Expense History & Undo** — timestamped entries with optional notes and a 6-second undo action for accidental deletions or monthly resets.
- **Safe CSV Export** — semicolon-delimited UTF-8 BOM export with formula-injection neutralization.
- **Zero-Dependency Modular Vanilla JS & Offline PWA** — ES modules separated by concern (`js/budget.js` + `js/app.js`), DOM built without `innerHTML`, `Service Worker` asset precaching, and automated `node --test` unit tests + GitHub Actions CI.

## Struktura projektu / Project Structure

```text
wydatki_app/
├── .github/workflows/ci.yml
├── css/styles.css
├── js/
│   ├── app.js          # Warstwa UI i obsługa DOM bez innerHTML
│   └── budget.js       # Czysta logika budżetu, migracja, eksport CSV
├── tests/
│   └── budget.test.mjs # Testy jednostkowe (node:test)
├── index.html
├── manifest.json
├── sw.js
└── package.json
```

## Uruchomienie i testy / Running Locally

```bash
npm run check
npm test
npm start
```
