use crate::{MAX_INPUT_VALUES, packet::evaluate, reserve_input};

fn point_packet(points: &[[f64; 2]]) -> Vec<f64> {
    let mut values = vec![
        1.0,
        1.0,
        points.len() as f64,
        140.0,
        39.0,
        150.0,
        1.0,
        0.0,
        140.0,
        39.0,
    ];
    values.extend(points.iter().flatten());
    values
}

#[test]
fn counts_only_points_in_buffer() {
    let output = evaluate(&point_packet(&[
        [140.0, 39.0],
        [140.0, 39.001],
        [140.0, 39.002],
    ]))
    .unwrap();
    assert_eq!(output[6], 0.0);
    assert_eq!(output[7], 2.0);
}

#[test]
fn refuses_malformed_packets_without_panicking() {
    let valid = point_packet(&[]);
    for end in 0..valid.len() {
        assert!(evaluate(&valid[..end]).is_err());
    }
    for index in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] {
        let mut packet = valid.clone();
        packet[index] = f64::NAN;
        assert!(evaluate(&packet).is_err());
    }
    let mut trailing = valid;
    trailing.push(0.0);
    assert!(evaluate(&trailing).is_err());
}

#[test]
fn bounds_allocation() {
    assert!(reserve_input(0).is_null());
    assert!(reserve_input((MAX_INPUT_VALUES + 1) as u32).is_null());
}
