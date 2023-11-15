# Stephen King API

**Authors**: [Hunter Van Lear](https://github.com/hvanlear)

## Ongoing Work
- [x] Fix prisma schema
- [x] Fix seed data
- [x] Import all seed data w/o relationships
- [x] Reset - create relationship with villains
- [x] Import all seed data w/ villain relationships
- [x] Create book routes
- [x] Create short routes
- [x] Create villain routes
- [x] Error Handlers for handlers
- [ ] Create protected routes
- [ ] Create docs page
- [ ] Rate limiting 
- [x] Launch
- [x] Better handling of URLS


## Overview
This is an open-source API that provides Novela, Short Story, character(*currently limited to villains*), and setting information for the written works of Stephen King. This information is publicly sourced; I do not claim to own.

## Routes
_All routes are GET routes_
* **GET /api/books** - get all books 
* **GET /api/shorts** - get all short stories 
* **GET /api/villains** - get all villians 

## Tech Stack
* Node
* Express
* Typescript
* Postgres
* Prisma ORM
* Hosted on Render

## Getting Started
I welcome any and all contributions! Feel free to submit a Pull Request with your changes to make this a better API for everyone!

1. Clone and download [GitHub repo]
1. Install dependencies:\
`npm i`
1. configure .env with database URL


## License
Standard [MIT](/LICENSE.md)


