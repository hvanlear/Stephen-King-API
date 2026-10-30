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
| `/api/book/:id` | One book, with its villains, the places it's set in, and its collection if it's one |
| `/api/shorts` | All short stories |
| `/api/short/:id` | One short story, with its villains, the places it's set in, where it first appeared and the collection it was published in |
| `/api/villains` | All villains |
| `/api/villain/:id` | One villain, with the works it appears in, where it lives and its type |
| `/api/places` | All places, from buildings up to towns, states and other worlds |
| `/api/place/:id` | One place, with the place it's in, the places inside it, the works set there and the villains who live there |
| `/api/types` | All villain types, from broad ones like Vampire to kinds from the stories like the True Knot |
| `/api/type/:id` | One type, with its kinds and its villains |
| `/api/collections` | All collections, such as Night Shift and Skeleton Crew |
| `/api/collection/:id` | One collection, with its short stories |
| `/api/publications` | All publications, the magazines and anthologies where shorts first appeared, such as Cavalier and The New Yorker |
| `/api/publication/:id` | One publication, with the short stories that first appeared there |

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

The data lives in seven files: `catalog/books.json`, `catalog/shorts.json`, `catalog/villains.json`, `catalog/places.json`, `catalog/types.json`, `catalog/collections.json` and `catalog/publications.json`. The API serves the records as they are, so a change to a file is a change to the API.

1. **To fix a record**, edit its fields in place.
1. **To add a record**, copy an existing record from the same file to the end of the list, so the field names and order match. Give it the next id: one higher than the last id in the file. Book ids 64–72 are skipped, because the old database used them. Set `created_at` to the current UTC time, like `2026-10-26T18:00:00.000Z`. The `handle` is the title in lowercase with hyphens, like `the-shining`.
1. **Never change or remove an id.** Apps save links like `/api/book/3`, and those have to keep pointing at the same book.
1. **To link a villain** to the works it appears in, list their `handle`s in the villain's `appears_in`. Books and shorts get their `villains` links from that list.
1. **To add a place**, give it a `type` (world, region, country, state, town, landmark or building) and the `parentId` of the place it's in: Marsten House is in Jerusalem's Lot, Maine, which is in Maine. Use `null` for a place the stories don't put anywhere named.
1. **To link a place** to the works set there, list their `handle`s in the place's `appears_in`. Leave out works that only mention it. The books and shorts get their `places` links from that list.
1. **To say where a villain lives**, list place `handle`s in the villain's `residence`. Give the most specific place: the villain's `residence` links to the Marsten House, and Jerusalem's Lot and Maine list the villain as well.
1. **To type a villain**, set `types_id` to a broad type from `catalog/types.json` (one with no `parentId`), and list any kinds from the stories under that type in `kinds`, such as `true-knot` under Vampire. Set `group` to `true` when the record is a gang, cult or race rather than one villain. Type id 5 is retired: the old database used it for groups.
1. **To say where a short was collected**, set its `collection` to a handle from `catalog/collections.json`, and its `collectedIn` to the collection's name and year, like `Night Shift (1978)`. For a story that was never collected, set `collection` to `null` and `collectedIn` to `Uncollected`, or `Uncollected (standalone book)` when it was published as a book of its own. A collection that's also a book takes the book's `handle`, and the two link to each other.
1. **To say where a short first appeared**, set its `publication` to a handle from `catalog/publications.json` (magazine, anthology, newspaper or other). Its `originallyPublishedIn` has to start with that publication's name, like `Cavalier (October 1970)`; a magazine or anthology series is one publication, and the issue or volume goes in the text, like `Shadows 4 (October 1981)`. Use `null` when the short first appeared in its own collection or as a book of its own.
1. **Run `npm run validate-data`** and fix anything it reports.
1. **Update the test snapshots** with `npx ts-node test/contract/capture.ts --local`. The tests compare responses against them, so every data change shows up there too. Check that the diff only shows your change.
1. **Open a pull request.** CI runs the build, the tests and the data check. The PR can't be merged until they all pass.

## License

- **Code:** [MIT](LICENSE)
- **Data:** [CC BY-SA 4.0](DATA-LICENSE.md), adapted from Wikipedia and the Stephen King Wiki. If you redistribute or modify the data, credit the sources and keep the same license.
