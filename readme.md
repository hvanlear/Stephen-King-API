# Stephen King API

- **Hosted**: https://stephen-king-api.onrender.com/ ⚠️ API is in ongoing development
- **Docs**: https://stephen-king-api.onrender.com/docs
- **Authors**: [Hunter Van Lear](https://github.com/hvanlear)

## Overview

This is an open-source API that provides novel, short story, character (_currently limited to villains_), and setting information for the written works of Stephen King. This information is publicly sourced, adapted from [Wikipedia](https://en.wikipedia.org/wiki/Stephen_King_bibliography) and the [Stephen King Wiki](https://stephenking.fandom.com); I do not claim to own it.

## Routes

_All routes are GET routes. No API key is needed._

| Route | Returns |
| --- | --- |
| `/api/books` | All books |
| `/api/book/:id` | One book |
| `/api/shorts` | All short stories |
| `/api/short/:id` | One short story |
| `/api/villains` | All villains |
| `/api/villain/:id` | One villain |

- The list routes return everything by default. To page through results instead, pass `page` and `limit` together (`limit` is capped at 100).
- Each IP address can make 100 requests a minute.
- Errors come back as JSON, for example `{ "error": "Book not found" }`.

The [docs page](https://stephen-king-api.onrender.com/docs) has example responses and every field.

## Tech Stack

- Node
- Express
- Typescript
- The catalog is JSON files in `catalog/`, loaded into memory at startup
- Postgres and Prisma, only for the usage dashboard's hit counts
- Hosted on Render

## Getting Started

I welcome any and all contributions! Feel free to submit a Pull Request with your changes to make this a better API for everyone!

You need Node 22 or newer. You don't need a database: the catalog lives in `catalog/*.json`, and Postgres only stores the usage dashboard's hit counts in production.

1. Clone the repo:\
   `git clone https://github.com/hvanlear/Stephen-King-API.git`
1. Install dependencies:\
   `npm i`
1. Start the dev server on port 3001:\
   `npm run dev`

Other commands:

- `npm test` runs the test suite.
- `npm run validate-data` checks the catalog files.
- `npm run build`, then `npm start`, runs the compiled app the way Render does.

## Adding or Fixing Data

The data lives in three files: `catalog/books.json`, `catalog/shorts.json` and `catalog/villains.json`. The API serves the records as they are, so a change to a file is a change to the API.

1. **To fix a record**, edit its fields in place.
1. **To add a record**, copy an existing record from the same file to the end of the list, so the field names and order match. Give it the next id: one higher than the last id in the file. Set `created_at` to the current UTC time, like `2026-10-26T18:00:00.000Z`. The `handle` is the title in lowercase with hyphens, like `the-shining`.
1. **Never change or remove an id.** Apps save links like `/api/book/3`, and those have to keep pointing at the same book.
1. **To link a villain** to the works it appears in, list their `handle`s in the villain's `appears_in`. Books and shorts get their `villains` links from that list.
1. **Run `npm run validate-data`** and fix anything it reports.
1. **Update the test snapshots** with `npx ts-node test/contract/capture.ts --local`. The tests compare responses against them, so every data change shows up there too. Check that the diff only shows your change.
1. **Open a pull request.** CI runs the build, the tests and the data check. The PR can't be merged until they all pass.

## License

- **Code:** [MIT](LICENSE)
- **Data:** [CC BY-SA 4.0](DATA-LICENSE.md), adapted from Wikipedia and the Stephen King Wiki. If you redistribute or modify the data, credit the sources and keep the same license.
