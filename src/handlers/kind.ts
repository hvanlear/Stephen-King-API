import { Request, Response } from "express";
import { Kind } from "../kinds";
import { sendList } from "../utils/pagination";
import { parseId } from "../utils/parseId";

// The list and detail handlers for one kind of record
export function kindHandlers(kind: Kind) {
  // The catalog never changes while the server runs, so build responses once
  const responses = kind.records.map((record) => kind.response(record));
  const responsesById = new Map(responses.map((record) => [record.id, record]));

  const getOne = (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: kind.invalidId });
    }
    const record = responsesById.get(id);
    if (!record) {
      return res.status(404).json({ error: kind.notFound });
    }
    res.json({ data: record });
  };

  const getList = (req: Request, res: Response) => {
    sendList(res, responses, req.query);
  };

  return { getOne, getList };
}
