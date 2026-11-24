use crate::geometry::{Feature, Position, Ring, distance_from_h};
use crate::{ABI_VERSION, MAX_INPUT_VALUES};

type ParseResult<T> = Result<T, &'static str>;

struct Reader<'a> {
    values: &'a [f64],
    offset: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, length: usize) -> ParseResult<&'a [f64]> {
        let end = self.offset.checked_add(length).ok_or("length")?;
        let values = self.values.get(self.offset..end).ok_or("truncated")?;
        self.offset = end;
        Ok(values)
    }

    fn number(&mut self) -> ParseResult<f64> {
        Ok(self.take(1)?[0])
    }

    fn count(&mut self, max: usize) -> ParseResult<usize> {
        let value = self.number()?;
        if !value.is_finite() || value < 0.0 || value > max as f64 || value.fract() != 0.0 {
            return Err("count");
        }
        Ok(value as usize)
    }

    fn position(&mut self) -> ParseResult<Position> {
        let values = self.take(2)?;
        let position = Position {
            lng: values[0],
            lat: values[1],
        };
        if !position.valid() {
            return Err("position");
        }
        Ok(position)
    }

    fn feature(&mut self) -> ParseResult<Feature<'a>> {
        let polygon_count = self.count(4096)?;
        if polygon_count == 0 {
            return Ok(Feature::Point(self.position()?));
        }
        let mut polygons = Vec::with_capacity(polygon_count);
        for _ in 0..polygon_count {
            let ring_count = self.count(4096)?;
            if ring_count == 0 {
                return Err("empty polygon");
            }
            let mut rings = Vec::with_capacity(ring_count);
            for _ in 0..ring_count {
                let vertices = self.count(MAX_INPUT_VALUES / 2)?;
                if vertices < 4 {
                    return Err("ring");
                }
                let values = self.take(vertices * 2)?;
                if values[..2] != values[values.len() - 2..] {
                    return Err("open ring");
                }
                if !values.chunks_exact(2).all(|p| {
                    Position {
                        lng: p[0],
                        lat: p[1],
                    }
                    .valid()
                }) {
                    return Err("position");
                }
                rings.push(Ring(values));
            }
            polygons.push(rings);
        }
        Ok(Feature::Area(polygons))
    }
}

// Packet: version, features, points, center lng/lat, buffer meters, complete;
// geometry (0 + point, or polygon/ring/vertex counts + lng/lat pairs), then points.
// Result per feature: bounds, shore lat/lng, distance meters, public count (-1 unknown).
pub fn evaluate(input: &[f64]) -> ParseResult<Vec<f64>> {
    if input.len() > MAX_INPUT_VALUES {
        return Err("size");
    }
    let mut reader = Reader {
        values: input,
        offset: 0,
    };
    if reader.count(ABI_VERSION as usize)? != ABI_VERSION as usize {
        return Err("version");
    }
    let feature_count = reader.count(512)?;
    let point_count = reader.count(1000)?;
    let center = reader.position()?;
    let buffer_m = reader.number()?;
    if !buffer_m.is_finite() || !(0.0..=10_000.0).contains(&buffer_m) {
        return Err("buffer");
    }
    let complete = reader.count(1)? == 1;
    let mut features = Vec::with_capacity(feature_count);
    for _ in 0..feature_count {
        features.push(reader.feature()?);
    }
    let mut points = Vec::with_capacity(point_count);
    for _ in 0..point_count {
        points.push(reader.position()?);
    }
    if reader.offset != input.len() {
        return Err("trailing values");
    }
    let mut output = Vec::with_capacity(feature_count * 8);
    for feature in features {
        let bounds = feature.bounds();
        let nearby = bounds.expand(buffer_m * 1.25);
        let (shore, h) = feature.shore(center);
        let distance = if feature.contains(center) {
            0.0
        } else {
            distance_from_h(h)
        };
        let count = if complete {
            points
                .iter()
                .filter(|&&point| nearby.includes(point) && feature.within_buffer(point, buffer_m))
                .count() as f64
        } else {
            -1.0
        };
        output.extend([
            bounds.min_lat,
            bounds.max_lat,
            bounds.min_lng,
            bounds.max_lng,
            shore.lat,
            shore.lng,
            distance,
            count,
        ]);
    }
    Ok(output)
}
