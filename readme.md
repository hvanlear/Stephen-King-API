# Stephen King API

- **Hoseted**: https://stephen-king-api.onrender.com/ ⚠️ API is in ongoing development
- **Authors**: [Hunter Van Lear](https://github.com/hvanlear)

## Ongoing Work

- [ ] Seed Types Data
- [ ] Create type routes
- [ ] Create protected routes
- [ ] Rate limiting
- [ ] Add install instructions to github

## Overview

This is an open-source API that provides Novela, Short Story, character(_currently limited to villains_), and setting information for the written works of Stephen King. This information is publicly sourced; I do not claim to own.

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

Standard [MIT](/LICENSE.md)
