use std::f64::consts::PI;

const EARTH_RADIUS_M: f64 = 6_371_000.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Position {
    pub lng: f64,
    pub lat: f64,
}

impl Position {
    pub fn valid(self) -> bool {
        self.lng.is_finite()
            && self.lat.is_finite()
            && self.lng.abs() <= 180.0
            && self.lat.abs() <= 90.0
    }
}

#[derive(Clone, Copy)]
pub struct Bounds {
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lng: f64,
    pub max_lng: f64,
}

impl Bounds {
    pub fn includes(self, point: Position) -> bool {
        point.lat >= self.min_lat
            && point.lat <= self.max_lat
            && point.lng >= self.min_lng
            && point.lng <= self.max_lng
    }

    pub fn expand(self, meters: f64) -> Self {
        let lat_delta = meters / 111_000.0;
        let lng_delta = lat_delta
            / ((self.min_lat + self.max_lat) / 2.0 * PI / 180.0)
                .cos()
                .max(0.000001);
        Self {
            min_lat: (self.min_lat - lat_delta).max(-90.0),
            max_lat: (self.max_lat + lat_delta).min(90.0),
            min_lng: (self.min_lng - lng_delta).max(-180.0),
            max_lng: (self.max_lng + lng_delta).min(180.0),
        }
    }
}

pub struct Ring<'a>(pub &'a [f64]);

impl Ring<'_> {
    pub fn point(&self, index: usize) -> Position {
        Position {
            lng: self.0[index * 2],
            lat: self.0[index * 2 + 1],
        }
    }

    fn contains(&self, point: Position) -> bool {
        let count = self.0.len() / 2;
        let mut inside = false;
        let mut previous = self.point(count - 1);
        for index in 0..count {
            let current = self.point(index);
            if (current.lat > point.lat) != (previous.lat > point.lat)
                && point.lng
                    < (previous.lng - current.lng) * (point.lat - current.lat)
                        / (previous.lat - current.lat)
                        + current.lng
            {
                inside = !inside;
            }
            previous = current;
        }
        inside
    }
}

pub enum Feature<'a> {
    Point(Position),
    Area(Vec<Vec<Ring<'a>>>),
}

fn haversine(point: Position, other: Position, point_cos: f64) -> f64 {
    let lat_sin = ((other.lat - point.lat) * PI / 180.0 / 2.0).sin();
    let lng_sin = ((other.lng - point.lng) * PI / 180.0 / 2.0).sin();
    lat_sin * lat_sin + point_cos * (other.lat * PI / 180.0).cos() * lng_sin * lng_sin
}

pub fn distance_from_h(h: f64) -> f64 {
    2.0 * EARTH_RADIUS_M * h.sqrt().min(1.0).asin()
}

fn project(point: Position, a: Position, b: Position, scale: f64) -> Position {
    let ax = (a.lng - point.lng) * scale;
    let ay = a.lat - point.lat;
    let bx = (b.lng - point.lng) * scale;
    let by = b.lat - point.lat;
    let dx = bx - ax;
    let dy = by - ay;
    let length = dx * dx + dy * dy;
    let t = if length == 0.0 {
        0.0
    } else {
        (-(ax * dx + ay * dy) / length).clamp(0.0, 1.0)
    };
    Position {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
    }
}

impl Feature<'_> {
    pub fn bounds(&self) -> Bounds {
        let mut bounds = Bounds {
            min_lat: f64::INFINITY,
            max_lat: f64::NEG_INFINITY,
            min_lng: f64::INFINITY,
            max_lng: f64::NEG_INFINITY,
        };
        let mut include = |point: Position| {
            bounds.min_lat = bounds.min_lat.min(point.lat);
            bounds.max_lat = bounds.max_lat.max(point.lat);
            bounds.min_lng = bounds.min_lng.min(point.lng);
            bounds.max_lng = bounds.max_lng.max(point.lng);
        };
        match self {
            Self::Point(point) => include(*point),
            Self::Area(polygons) => {
                for ring in polygons.iter().flatten() {
                    for index in 0..ring.0.len() / 2 {
                        include(ring.point(index));
                    }
                }
            }
        }
        bounds
    }

    pub fn contains(&self, point: Position) -> bool {
        match self {
            Self::Point(_) => false,
            Self::Area(polygons) => polygons.iter().any(|rings| {
                rings[0].contains(point) && !rings[1..].iter().any(|ring| ring.contains(point))
            }),
        }
    }

    pub fn shore(&self, point: Position) -> (Position, f64) {
        let point_cos = (point.lat * PI / 180.0).cos();
        if let Self::Point(location) = self {
            return (*location, haversine(point, *location, point_cos));
        }
        let Self::Area(polygons) = self else {
            unreachable!()
        };
        let scale = point_cos.max(0.000001);
        let mut closest = point;
        let mut best = f64::INFINITY;
        for ring in polygons.iter().flatten() {
            let mut previous = ring.point(0);
            for index in 1..ring.0.len() / 2 {
                let current = ring.point(index);
                let candidate = project(point, previous, current, scale);
                let h = haversine(point, candidate, point_cos);
                if h < best {
                    best = h;
                    closest = candidate;
                }
                previous = current;
            }
        }
        (closest, best)
    }

    pub fn within_buffer(&self, point: Position, buffer_m: f64) -> bool {
        if self.contains(point) {
            return true;
        }
        let point_cos = (point.lat * PI / 180.0).cos();
        if let Self::Point(location) = self {
            return distance_from_h(haversine(point, *location, point_cos)) <= buffer_m;
        }
        let Self::Area(polygons) = self else {
            unreachable!()
        };
        let scale = point_cos.max(0.000001);
        let limit_h = (buffer_m / (2.0 * EARTH_RADIUS_M)).sin().powi(2);
        for ring in polygons.iter().flatten() {
            let mut previous = ring.point(0);
            for index in 1..ring.0.len() / 2 {
                let current = ring.point(index);
                let h = haversine(point, project(point, previous, current, scale), point_cos);
                // Avoid asin/sqrt for distant edges; retain the original meter
                // comparison at the 150m boundary rather than a rounded distance.
                if h <= limit_h * (1.0 + 1e-10) && distance_from_h(h) <= buffer_m {
                    return true;
                }
                previous = current;
            }
        }
        false
    }
}
