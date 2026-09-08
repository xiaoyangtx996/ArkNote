//! Edge-dock geometry: pinned notes collapse to a bookmark tab on screen edges.

#![allow(dead_code)]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DockEdge {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DockPlan {
    pub edge: DockEdge,
    pub rest_x: f64,
    pub rest_y: f64,
    pub rest_w: f64,
    pub rest_h: f64,
    pub hide_x: f64,
    pub hide_y: f64,
    pub hide_w: f64,
    pub hide_h: f64,
}

/// How close to an edge (logical px) counts as "near" for docking.
pub const EDGE_THRESHOLD: f64 = 36.0;
/// Bookmark tab thickness (height of horizontal tab).
pub const BOOKMARK_THICK: f64 = 32.0;
/// Bookmark tab length (width of horizontal tab).
pub const BOOKMARK_LEN: f64 = 100.0;
/// Pull flush into the physical edge so DWM/hairline gaps disappear.
pub const EDGE_FLUSH_NUDGE: f64 = 2.0;

/// Pick nearest edge if the window is within `EDGE_THRESHOLD`, else `None`.
pub fn plan_dock(window: Rect, work: Rect) -> Option<DockPlan> {
    if window.width <= 0.0 || window.height <= 0.0 || work.width <= 0.0 || work.height <= 0.0 {
        return None;
    }

    let work_right = work.x + work.width;
    let work_bottom = work.y + work.height;
    let win_right = window.x + window.width;
    let win_bottom = window.y + window.height;

    let dist_left = (window.x - work.x).abs();
    let dist_right = (work_right - win_right).abs();
    let dist_top = (window.y - work.y).abs();
    let dist_bottom = (work_bottom - win_bottom).abs();

    let mut best: Option<(DockEdge, f64)> = None;
    let consider = |edge: DockEdge, dist: f64, best: &mut Option<(DockEdge, f64)>| {
        if dist > EDGE_THRESHOLD {
            return;
        }
        match *best {
            None => *best = Some((edge, dist)),
            Some((_, d)) if dist < d => *best = Some((edge, dist)),
            _ => {}
        }
    };

    consider(DockEdge::Left, dist_left, &mut best);
    consider(DockEdge::Right, dist_right, &mut best);
    consider(DockEdge::Top, dist_top, &mut best);
    consider(DockEdge::Bottom, dist_bottom, &mut best);

    let (edge, _) = best?;

    let rest_x = window.x.clamp(work.x, (work_right - window.width).max(work.x));
    let rest_y = window
        .y
        .clamp(work.y, (work_bottom - window.height).max(work.y));
    let rest_w = window.width;
    let rest_h = window.height;

    // Always a horizontal tab (icon + title left-to-right), on every edge.
    let hide_w = BOOKMARK_LEN;
    let hide_h = BOOKMARK_THICK;

    let (hide_x, hide_y) = match edge {
        DockEdge::Left => {
            let y = rest_y.clamp(work.y, (work_bottom - hide_h).max(work.y));
            (work.x - EDGE_FLUSH_NUDGE, y)
        }
        DockEdge::Right => {
            let y = rest_y.clamp(work.y, (work_bottom - hide_h).max(work.y));
            (work_right - hide_w + EDGE_FLUSH_NUDGE, y)
        }
        DockEdge::Top => {
            let x = rest_x.clamp(work.x, (work_right - hide_w).max(work.x));
            (x, work.y - EDGE_FLUSH_NUDGE)
        }
        DockEdge::Bottom => {
            let x = rest_x.clamp(work.x, (work_right - hide_w).max(work.x));
            (x, work_bottom - hide_h + EDGE_FLUSH_NUDGE)
        }
    };

    Some(DockPlan {
        edge,
        rest_x,
        rest_y,
        rest_w,
        rest_h,
        hide_x,
        hide_y,
        hide_w,
        hide_h,
    })
}

pub fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn work() -> Rect {
        Rect {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        }
    }

    #[test]
    fn left_edge_becomes_bookmark_tab() {
        let win = Rect {
            x: 10.0,
            y: 200.0,
            width: 300.0,
            height: 400.0,
        };
        let plan = plan_dock(win, work()).expect("dock");
        assert_eq!(plan.edge, DockEdge::Left);
        assert!((plan.hide_w - BOOKMARK_LEN).abs() < 0.01);
        assert!((plan.hide_h - BOOKMARK_THICK).abs() < 0.01);
        assert!((plan.hide_x - (0.0 - EDGE_FLUSH_NUDGE)).abs() < 0.01);
        assert!((plan.rest_w - 300.0).abs() < 0.01);
    }

    #[test]
    fn right_edge_bookmark_flush() {
        let win = Rect {
            x: 1920.0 - 300.0 - 8.0,
            y: 100.0,
            width: 300.0,
            height: 400.0,
        };
        let plan = plan_dock(win, work()).expect("dock");
        assert_eq!(plan.edge, DockEdge::Right);
        assert!((plan.hide_w - BOOKMARK_LEN).abs() < 0.01);
        assert!((plan.hide_h - BOOKMARK_THICK).abs() < 0.01);
        assert!((plan.hide_x - (1920.0 - BOOKMARK_LEN + EDGE_FLUSH_NUDGE)).abs() < 0.01);
    }

    #[test]
    fn center_does_not_dock() {
        let win = Rect {
            x: 800.0,
            y: 300.0,
            width: 300.0,
            height: 400.0,
        };
        assert!(plan_dock(win, work()).is_none());
    }

    #[test]
    fn top_edge_horizontal_bookmark() {
        let win = Rect {
            x: 400.0,
            y: 6.0,
            width: 300.0,
            height: 400.0,
        };
        let plan = plan_dock(win, work()).expect("dock");
        assert_eq!(plan.edge, DockEdge::Top);
        assert!((plan.hide_w - BOOKMARK_LEN).abs() < 0.01);
        assert!((plan.hide_h - BOOKMARK_THICK).abs() < 0.01);
        assert!((plan.hide_y - (0.0 - EDGE_FLUSH_NUDGE)).abs() < 0.01);
    }
}
