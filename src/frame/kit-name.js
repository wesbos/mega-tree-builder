export function kitFilename(p) {
  return `mega-tree-${p.height}in-high_${p.base}in-base_${p.top}in-top_${
    p.angle
  }deg_${p.strands}runs_${p.pitch}in-pitch${
    p.star ? '_' + p.starWidth + 'in-star' : ''
  }.zip`
}
