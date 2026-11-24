// A rolling-ball fillet is a closing: offset the outside by R, fuse it, then
// offset the exposed surface inward by R. This also rounds three-way junctions.
import type { Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d'
import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

export interface Barrel {
  start: Vec3
  axis: Vec3 // unit vector
  length: number
  radius: number
  edge: number
}

export function filletedJunction(
  M: ManifoldToplevel['Manifold'],
  barrel: (radius: number, height: number, lip: number) => Manifold,
  bodies: Barrel[],
  radius: number
) {
  const skins = bodies.map((b) => {
    const [x, y, z] = b.axis
    return barrel(b.radius + radius, b.length + 2 * radius, b.edge + radius)
      .translate([0, 0, -radius])
      .rotate([
        0,
        (Math.acos(z) * 180) / Math.PI,
        (Math.atan2(y, x) * 180) / Math.PI,
      ])
      .translate(b.start)
  })
  const expanded = M.union(skins)
  const mesh = expanded.getMesh()
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.vertProperties, 3))
  geometry.setIndex(new BufferAttribute(mesh.triVerts, 1))
  const boundary = new MeshBVH(geometry)
  const point = new Vector3()
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 }
  function distance([x, y, z]: Vec3) {
    let first = Infinity,
      second = Infinity
    for (const b of bodies) {
      const dx = x - b.start[0],
        dy = y - b.start[1],
        dz = z - b.start[2]
      const axial = dx * b.axis[0] + dy * b.axis[1] + dz * b.axis[2]
      const radial = Math.sqrt(
        Math.max(0, dx * dx + dy * dy + dz * dz - axial * axial)
      )
      const u = radial - b.radius + b.edge,
        v = Math.abs(axial - b.length / 2) - b.length / 2 + b.edge
      const d =
        Math.min(Math.max(u, v), 0) +
        Math.hypot(Math.max(u, 0), Math.max(v, 0)) -
        b.edge
      if (d < first) {
        second = first
        first = d
      } else second = Math.min(second, d)
    }
    // Beyond the blend, a rolling ball touches only one barrel. Use its
    // analytic surface, keeping the socket lips and flat end faces precise.
    if (first >= radius || first < -2 || second > 2 * radius + 2) return -first
    const nearest = boundary.closestPointToPoint(
      point.set(x, y, z),
      hit,
      0,
      radius + 2
    )
    return nearest ? nearest.distance - radius : 2
  }
  // Sample the offset surface before drilling. The final bores, stops, and
  // pilots are high-resolution revolved cuts independent of the sampling grid.
  const result = M.levelSet(
    distance,
    expanded.boundingBox(),
    1.25,
    0,
    0.008
  ).simplify(0.018)
  geometry.dispose()
  return result
}
