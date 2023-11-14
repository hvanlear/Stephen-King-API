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
- [ ] Error Handlers
- [ ] Create protected routes
- [ ] Create docs page
- [ ] Figure out rate limiting 
- [ ] lauch site


## Overview
This is an open-source API that provides Novela, Short Story, character(*currently limited to villains*), and setting information for the written works of Stephen King. This information is publicly sourced; I do not claim to own.

## Routes
_All routes are GET routes_
* **GET /api/books** - get all books (default 20 per page / 'enter TOTAL here' total books)
* **GET /api/shorts** - get all short stories (default 20 per page / 'enter TOTAL here' total short stories)
* **GET /api/villains** - get all villians 

## Getting Started
I welcome any and all contributions! Feel free to submit a Pull Request with your changes to make this a better API for everyone!

1. Clone and download [GitHub repo]
1. Install dependencies:\
`npm i`
1. configure .env with database URL


## License
Standard [MIT](/LICENSE.md)


