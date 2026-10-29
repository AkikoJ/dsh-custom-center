import type { Diagnostic } from "../types.js";

type UploadFile = File & { _dssmPath?: string; };

type UploadSelection = {
  kind: string;
  name: string;
  files: UploadFile[];
  count: number;
  size: number;
  error?: never;
};

type SelectionResult = UploadSelection | { error: Diagnostic; };

var MAX_UPLOAD_ARCHIVE_BYTES = 32 << 20,
  MAX_UPLOAD_ENTRY_BYTES = 32 << 20,
  MAX_UPLOAD_TOTAL_BYTES = 64 << 20,
  MAX_UPLOAD_ENTRIES = 1000;

function uploadFilePath(file: UploadFile) {
  return String(
    (file && (file._dssmPath || file.webkitRelativePath || file.name)) || "",
  ).replace(/\\/g, "/");
}

function inspectUploadSelection(
  files: ArrayLike<UploadFile> | null,
): SelectionResult | null {
  var list = Array.from(files || []);
  if (!list.length) return null;
  if (list.length > MAX_UPLOAD_ENTRIES)
    return {
      error: {
        code: "error.upload.tooMany",
        params: { limit: MAX_UPLOAD_ENTRIES },
      },
    };
  var relative = list.some(function (file) {
    return uploadFilePath(file).includes("/");
  });
  if (relative) {
    if (
      !list.some(function (file) {
        return /(^|\/)skill\.md$/i.test(uploadFilePath(file));
      })
    )
      return { error: { code: "select.folder.invalid" } };
    var oversized = list.find(function (file) {
      return Number(file.size || 0) > MAX_UPLOAD_ENTRY_BYTES;
    });
    if (oversized)
      return {
        error: {
          code: "error.upload.tooLarge",
          params: { limit: MAX_UPLOAD_ENTRY_BYTES },
        },
      };
    var total = list.reduce(function (sum, file) {
      return sum + Number(file.size || 0);
    }, 0);
    if (total > MAX_UPLOAD_TOTAL_BYTES)
      return {
        error: {
          code: "error.upload.tooLarge",
          params: { limit: MAX_UPLOAD_TOTAL_BYTES },
        },
      };
    return {
      kind: "folder",
      name: uploadFilePath(list[0]).split("/")[0],
      files: list,
      count: list.length,
      size: total,
    };
  }
  if (list.length !== 1) return { error: { code: "select.file.invalid" } };
  var name = String(list[0].name || ""),
    lower = name.toLowerCase();
  var size = Number(list[0].size || 0);
  if (lower === "skill.md")
    return size > MAX_UPLOAD_ENTRY_BYTES
      ? {
        error: {
          code: "error.upload.tooLarge",
          params: { limit: MAX_UPLOAD_ENTRY_BYTES },
        },
      }
      : { kind: "skill", name: name, files: list, count: 1, size: size };
  if (lower.endsWith(".zip"))
    return size > MAX_UPLOAD_ARCHIVE_BYTES
      ? {
        error: {
          code: "error.upload.archiveTooLarge",
          params: { limit: MAX_UPLOAD_ARCHIVE_BYTES },
        },
      }
      : { kind: "zip", name: name, files: list, count: 1, size: size };
  return { error: { code: "select.file.invalid" } };
}

function bytesToBase64(buffer: ArrayBuffer) {
  var bytes = new Uint8Array(buffer),
    binary = "",
    chunk = 0x8000;
  for (var i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  return btoa(binary);
}

function buildUploadPayload(selection: UploadSelection) {
  return Promise.all(
    selection.files.map(function (file) {
      return file.arrayBuffer().then(function (buffer) {
        return { path: uploadFilePath(file), data: bytesToBase64(buffer) };
      });
    }),
  ).then(function (entries) {
    return selection.kind === "zip"
      ? { name: selection.name, zip: entries[0].data }
      : { name: selection.name, entries: entries };
  });
}

function readDroppedEntry(
  entry: FileSystemEntry,
  prefix: string,
  output: UploadFile[],
): Promise<void> {
  if (entry.isFile)
    return new Promise<void>(function (resolve, reject) {
      (entry as FileSystemFileEntry).file(function (file: UploadFile) {
        file._dssmPath = prefix + file.name;
        output.push(file);
        resolve();
      }, reject);
    });
  if (!entry.isDirectory) return Promise.resolve();
  return new Promise<void>(function (resolve, reject) {
    var reader = (entry as FileSystemDirectoryEntry).createReader(),
      children: FileSystemEntry[] = [];
    function next() {
      reader.readEntries(function (batch) {
        if (!batch.length) {
          Promise.all(
            children.map(function (child) {
              return readDroppedEntry(child, prefix + entry.name + "/", output);
            }),
          ).then(function () {
            resolve();
          }, reject);
          return;
        }
        children = children.concat(batch);
        next();
      }, reject);
    }
    next();
  });
}

function droppedFiles(dataTransfer: DataTransfer) {
  var items = Array.from((dataTransfer && dataTransfer.items) || []),
    entries = items
      .map(function (item) {
        return item.webkitGetAsEntry && item.webkitGetAsEntry();
      })
      .filter((entry): entry is FileSystemEntry => !!entry);
  if (!entries.length)
    return Promise.resolve(
      Array.from((dataTransfer && dataTransfer.files) || []),
    );
  var files: UploadFile[] = [];
  return Promise.all(
    entries.map(function (entry) {
      return readDroppedEntry(entry, "", files);
    }),
  ).then(function () {
    return files;
  });
}
export { buildUploadPayload, bytesToBase64, droppedFiles, inspectUploadSelection, MAX_UPLOAD_ARCHIVE_BYTES, MAX_UPLOAD_ENTRIES, MAX_UPLOAD_ENTRY_BYTES, MAX_UPLOAD_TOTAL_BYTES, readDroppedEntry, uploadFilePath, type SelectionResult, type UploadFile, type UploadSelection };
