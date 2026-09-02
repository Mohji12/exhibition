# Conninter Visitor Book

Mobile-first exhibition lead-capture app for Conninter booth staff.

## Development

```sh
npm install
npm run dev
```

Dev server runs at http://localhost:8080.

## Tests

```sh
npm run test:logic
npm run test:capture
```

## Database

Apply SQL migrations in order from `sql/` against the `coninter` MySQL database. Credentials live in `.env`.
