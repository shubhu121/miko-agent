

import fs from "fs";
import path from "path";
import { Hono } from "hono";
import { safeReadFile } from "../../shared/safe-fs.ts";
import { resolveAgent } from "../utils/resolve-agent.ts";

function isInsideRoot(candidatePath, rootPath) {
  return candidatePath === rootPath || candidatePath.startsWith(rootPath + path.sep);
}


function resolveAllowedPath(filePath, allowedRoots) {
  const resolved = path.resolve(filePath);

  for (const root of allowedRoots) {
    const resolvedRoot = path.resolve(root);
    if (!isInsideRoot(resolved, resolvedRoot)) continue;

    let realRoot = null;
    try { realRoot = fs.realpathSync(resolvedRoot); }
    catch { continue; }

    try {
      const stat = fs.lstatSync(resolved);
      if (stat.isSymbolicLink()) return null;
      const realPath = fs.realpathSync(resolved);
      if (isInsideRoot(realPath, realRoot)) return realPath;
      return null;
    } catch (err) {
      if (err?.code !== "ENOENT") return null;
      try {
        const realParent = fs.realpathSync(path.dirname(resolved));
        if (isInsideRoot(realParent, realRoot)) return resolved;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function escapeHtmlCell(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createFsRoute(engine) {
  const route = new Hono();
  const mikoHome = path.resolve(engine.mikoHome);

  
  function getAllowedRoots(c) {
    const roots = [mikoHome];
    
    const agent = resolveAgent(engine, c);
    const deskHome = agent?.config?.desk?.home_folder || engine.getHomeCwd?.(agent?.id);
    if (deskHome) roots.push(path.resolve(deskHome));
    return roots;
  }

  
  route.get("/fs/read", async (c) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "missing path" }, 400);
    const allowedPath = resolveAllowedPath(filePath, getAllowedRoots(c));
    if (!allowedPath) {
      return c.json({ error: "path not allowed" }, 403);
    }
    const content = safeReadFile(allowedPath, null);
    if (content === null) return c.json({ error: "file not found" }, 404);
    return c.text(content);
  });

  
  route.get("/fs/read-base64", async (c) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "missing path" }, 400);
    const allowedPath = resolveAllowedPath(filePath, getAllowedRoots(c));
    if (!allowedPath) {
      return c.json({ error: "path not allowed" }, 403);
    }
    try {
      const buf = fs.readFileSync(allowedPath);
      return c.text(buf.toString("base64"));
    } catch {
      return c.json({ error: "file not found" }, 404);
    }
  });

  
  route.get("/fs/docx-html", async (c) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "missing path" }, 400);
    const allowedPath = resolveAllowedPath(filePath, getAllowedRoots(c));
    if (!allowedPath) {
      return c.json({ error: "path not allowed" }, 403);
    }
    try {
      const stat = fs.statSync(allowedPath);
      if (!stat.isFile()) return c.json({ error: "not a file" }, 400);
      if (stat.size > 20 * 1024 * 1024) return c.json({ error: "file too large" }, 413);
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.convertToHtml({ path: allowedPath });
      return c.text(result.value);
    } catch (err) {
      if (err?.code === "ENOENT") return c.json({ error: "file not found" }, 404);
      return c.json({ error: "docx parse failed" }, 500);
    }
  });

  
  route.get("/fs/xlsx-html", async (c) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "missing path" }, 400);
    const allowedPath = resolveAllowedPath(filePath, getAllowedRoots(c));
    if (!allowedPath) {
      return c.json({ error: "path not allowed" }, 403);
    }
    try {
      const stat = fs.statSync(allowedPath);
      if (!stat.isFile()) return c.json({ error: "not a file" }, 400);
      if (stat.size > 20 * 1024 * 1024) return c.json({ error: "file too large" }, 413);
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(allowedPath);
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount === 0) return c.json({ error: "xlsx has no rows" }, 422);
      let html = "<table>";
      sheet.eachRow((row) => {
        html += "<tr>";
        for (let i = 1; i <= sheet.columnCount; i += 1) {
          html += `<td>${escapeHtmlCell(row.getCell(i).text)}</td>`;
        }
        html += "</tr>";
      });
      html += "</table>";
      return c.text(html);
    } catch (err) {
      if (err?.code === "ENOENT") return c.json({ error: "file not found" }, 404);
      return c.json({ error: "xlsx parse failed" }, 500);
    }
  });

  return route;
}
