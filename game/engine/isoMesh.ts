import { ISO } from "@/game/data/tiles";
import type { BuildingModelConfig } from "@/game/data/tiles";

/**
 * Pure OBJ -> iso-vertex converter. Phaser's own Mesh.addVerticesFromObj
 * rotates about the model axes (its fromRotationXYTranslation always maps the
 * model X axis horizontally), which cannot produce the game's 2:1 iso diamond.
 * So we transform the raw vertices ourselves with the SAME projection the grid
 * uses (world x = (col-row)*HALF_W, world y = (row+col)*HALF_H), then feed the
 * flat arrays into Mesh.addVertices. No Phaser imports: deterministic and unit
 * testable, and the engine stays art-agnostic.
 *
 * The OBJ data shape is Phaser.Geom.Mesh.ParseObj's output, which the OBJ
 * loader stores in the OBJ cache (cache.obj.get(key)).
 */

/** One model as parsed by ParseObj (subset of fields the projection needs). */
export interface ParsedObjModel {
  vertices: { x: number; y: number; z: number }[];
  textureCoords: { u: number; v: number }[];
  faces: { vertices: { vertexIndex: number; textureCoordsIndex: number }[] }[];
}

export interface ParsedObjData {
  models: ParsedObjModel[];
}

/** Flat triangle soup: 3 XYZ per triangle (containsZ=true) + matching UV pairs. */
export interface IsoMeshArrays {
  verts: number[];
  uvs: number[];
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

/**
 * Project every triangle of the model into the iso grid plane.
 *
 * Steps, per model vertex: translate by the config offset (model units, this
 * is how a model's footprint is centered on the anchor cell), yaw about the
 * up axis so the model faces the desired screen corner, scale to grid units,
 * then apply the same linear map as the iso grid:
 *   X = (x - z) * scale * HALF_W      (model +x -> +col diagonal)
 *   Y = -(x + z) * scale * HALF_H + y * scale * HALF_W   (y = up on screen)
 *   Z = -(x + z) * scale - y * scale  (painter's depth, see below)
 * A model cube of 1 unit therefore becomes exactly one 132x66 iso tile, so
 * `scale = (footW+footH)/(xSpan+zSpan)` makes the projected footprint fill its
 * tile diamond.
 *
 * Y is negated here because Phaser's Mesh transform produces screen-down
 * coords via `vy = -(ty/tw) * height`; feeding the raw grid Y (also down-
 * positive) would mirror the model vertically. That negation also reflects
 * face winding, so building meshes must render with `hideCCW = false`
 * (MainScene.buildBuildingMesh). Z feeds Face.depth (vz = -0.001*Z): faces
 * further from the camera (small x+z, low y) get small vz and draw first.
 */
export function projectObj(
  data: ParsedObjData,
  cfg: Pick<BuildingModelConfig, "scale" | "yawDeg" | "offsetX" | "offsetY" | "offsetZ">,
): IsoMeshArrays {
  const yaw = degToRad(cfg.yawDeg);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const verts: number[] = [];
  const uvs: number[] = [];

  for (const model of data.models) {
    for (const face of model.faces) {
      for (const corner of face.vertices) {
        const v = model.vertices[corner.vertexIndex];
        // Faces without a vt entry parse to textureCoordsIndex -1; default the
        // UV so untextured exporters still render (flat via the mesh tint).
        const t = model.textureCoords[corner.textureCoordsIndex] ?? { u: 0, v: 0 };
        const ox = v.x + cfg.offsetX;
        const oy = v.y + cfg.offsetY;
        const oz = v.z + cfg.offsetZ;
        const x = ox * cy + oz * sy;
        const z = -ox * sy + oz * cy;
        const s = cfg.scale;
        verts.push(
          (x - z) * s * ISO.HALF_W,
          -(x + z) * s * ISO.HALF_H + oy * s * ISO.HALF_W,
          -(x + z) * s - oy * s,
        );
        uvs.push(t.u, t.v);
      }
    }
  }

  return { verts, uvs };
}