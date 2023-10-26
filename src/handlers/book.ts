import prisma from "../db";

//Create a book

export const createABook = async (req, res) => {
  const book = await prisma.book.create({
    data: {
      Year: req.body.Year,
      Title: req.body.Title,
      handle: req.body.handle,
      Pages: req.body.Pages,
      Publisher: req.body.Publisher,
      ISBN: req.body.ISBN,
      Notes: req.body.Notes,
    },
  });

  res.json({ data: book });
};

// export const createMultiBooks = async (req,res, next)=> {
//     try {
//         var i = 0;
//         while (i < req.body.length) {
//           await Book.create(req.body[i]);
//           i++;
//         }

//         return res.status(201).send(`Created ${i} records.`);
//       } catch (err) {
//         return next(err);
//       }
//     const books = await prisma.book.createMany({
//         data: {
//             Year: req.body.Year,
//             Title: req.body.Title,
//             handle: req.body.handle,
//             Pages: req.body.Pages,
//             Publisher: req.body.Publisher,
//             ISBN: req.body.ISBN,
//             Notes: req.body.Notes,
//           },
//     })
// }
