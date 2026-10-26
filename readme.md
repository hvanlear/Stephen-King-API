# Stephen King API

- **Hosted**: https://stephen-king-api.onrender.com/ ⚠️ API is in ongoing development
- **Authors**: [Hunter Van Lear](https://github.com/hvanlear)

## Overview

This is an open-source API that provides Novela, Short Story, character(_currently limited to villains_), and setting information for the written works of Stephen King. This information is publicly sourced, adapted from [Wikipedia](https://en.wikipedia.org/wiki/Stephen_King_bibliography) and the [Stephen King Wiki](https://stephenking.fandom.com); I do not claim to own it.

## Routes

_All routes are GET routes_

- **GET /api/books** - get all books
- **GET /api/shorts** - get all short stories
- **GET /api/villains** - get all villians

## Tech Stack

- Node
- Express
- Typescript
- Postgres
- Prisma ORM
- Hosted on Render

## Getting Started

I welcome any and all contributions! Feel free to submit a Pull Request with your changes to make this a better API for everyone!

1. Clone and download [GitHub repo]
1. Install dependencies:\
   `npm i`
1. configure .env with database URL

## License

- **Code:** [MIT](LICENSE)
- **Data:** [CC BY-SA 4.0](DATA-LICENSE.md), adapted from Wikipedia and the Stephen King Wiki. If you redistribute or modify the data, credit the sources and keep the same license.
