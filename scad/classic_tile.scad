// @id classic_tile
// @name Classic Tile
// @description Smooth low-profile tile without top studs and with bottom female sockets.
// @param X|Width (studs)|1|16|1|2
// @param Y|Length (studs)|1|16|1|4
// @param scale_percent|Global Scale (%)|90|110|1|100
//
// Reference proportions:
// - block pitch = 8.0mm
// - tile body height = 3.2mm
// This version keeps the geometry in the Open Brick browser-compatible SCAD subset.

s = scale_percent / 100;

unit = 1.6 * s;
block = unit * 5;
outert = 0.15 * s;

actualX = X * block - outert;
actualY = Y * block - outert;
height = unit * 2;

topthickness = unit;
wallthickness = unit - outert / 2;
inner_h = height - topthickness;

// Tube-like underside socket dimensions.
ODtube = 6.5137 * s;
tube_h = inner_h;
tube_x0 = block - outert / 2;
tube_y0 = block - outert / 2;

union() {
  // Hollow body shell with open bottom and smooth top.
  translate([0, 0, height - topthickness]) {
    cube([actualX, actualY, topthickness], center=false);
  }
  cube([wallthickness, actualY, inner_h], center=false);
  translate([actualX - wallthickness, 0, 0]) {
    cube([wallthickness, actualY, inner_h], center=false);
  }
  translate([wallthickness, 0, 0]) {
    cube([actualX - wallthickness * 2, wallthickness, inner_h], center=false);
  }
  translate([wallthickness, actualY - wallthickness, 0]) {
    cube([actualX - wallthickness * 2, wallthickness, inner_h], center=false);
  }

  // Bottom female sockets as cylindrical tubes.
  for (i = [0:1:X - 2]) {
    for (j = [0:1:Y - 2]) {
      cx = tube_x0 + i * block;
      cy = tube_y0 + j * block;
      translate([cx, cy, 0]) {
        cylinder(h=tube_h, r=ODtube / 2, $fn=40);
      }
    }
  }
}
