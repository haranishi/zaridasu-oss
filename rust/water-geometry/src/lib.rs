mod geometry;
mod packet;

use std::cell::RefCell;

pub const MAX_INPUT_VALUES: usize = 1_000_000;
pub const ABI_VERSION: u32 = 1;

thread_local! {
    static INPUT: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
    static OUTPUT: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn abi_version() -> u32 {
    ABI_VERSION
}

// JavaScript writes into this module-owned buffer. No caller-provided pointer is
// dereferenced in Rust; malformed packets go through the checked slice reader.
#[unsafe(no_mangle)]
pub extern "C" fn reserve_input(length: u32) -> *mut f64 {
    if length == 0 || length as usize > MAX_INPUT_VALUES {
        return std::ptr::null_mut();
    }
    INPUT.with_borrow_mut(|input| {
        input.resize(length as usize, 0.0);
        input.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn calculate() -> u32 {
    let result = INPUT.with_borrow(|input| packet::evaluate(input));
    OUTPUT.with_borrow_mut(|output| match result {
        Ok(values) => {
            *output = values;
            1
        }
        Err(_) => {
            output.clear();
            0
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn output_ptr() -> *const f64 {
    OUTPUT.with_borrow(|output| output.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn output_len() -> u32 {
    OUTPUT.with_borrow(|output| output.len() as u32)
}

#[cfg(test)]
mod tests;
