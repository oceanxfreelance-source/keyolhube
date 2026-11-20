"use client";
import { make } from "@/lib/doc/factory";
import { boundsIn, IDENTITY, locate } from "@/lib/doc/geometry";
import { makeMask } from "@/lib/doc/ops";
import type { ImageNode, Page } from "@/lib/doc/types";
import type { EditorStore } from "@/lib/editor/store";
import { uploadImage, type UploadedAsset } from "./useUploads";

/** Open the file chooser for one image and upload it. */
export function pickPhoto(): Promise<UploadedAsset | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try { resolve(await uploadImage(f)); } catch (e) { reject(e); }
    };
    input.click();
  });
}

/** Crop that fills a w x h frame with the image (like CSS object-fit: cover), centred. */
export function coverCrop(natW: number, natH: number, w: number, h: number) {
  const fa = w / h, na = natW / natH;
  const cw = na > fa ? natH * fa : natW, ch = cw / fa;
  return { x: (natW - cw) / 2, y: (natH - ch) / 2, width: cw, height: ch };
}

/** Put a photo inside a shape: the shape becomes a mask frame holding the photo. */
export function fillShapeWithPhoto(store: EditorStore, shapeId: string, a: UploadedAsset) {
  let gid: string | null = null;
  store.getState().changePage("Put photo in shape", (p) => {
    const l = locate(p as Page, shapeId);
    if (!l) return;
    const b = boundsIn(l.node, IDENTITY); // in the shape's list coordinates
    const img = make.image(b.x, b.y, b.width, b.height, a.id, a.url, a.width, a.height);
    img.crop = coverCrop(a.width, a.height, b.width, b.height);
    l.list.splice(l.index + 1, 0, img);
    gid = makeMask(p as Page, [shapeId, img.id]);
  });
  if (gid) store.getState().select([gid]);
}

/** Swap the picture of an image element (or the photo inside a frame), keeping its size. */
export function replacePhoto(store: EditorStore, id: string, a: UploadedAsset) {
  store.getState().changePage("Replace photo", (p) => {
    const l = locate(p as Page, id);
    if (!l) return;
    let img: ImageNode | undefined;
    if (l.node.type === "image") img = l.node;
    else if (l.node.type === "group" && l.node.mask) img = l.node.children.find((c) => c.type === "image") as ImageNode | undefined;
    if (!img) return;
    img.assetId = a.id; img.src = a.url; img.naturalWidth = a.width; img.naturalHeight = a.height;
    img.crop = coverCrop(a.width, a.height, img.width, img.height);
    delete img.adjust;
  });
}
