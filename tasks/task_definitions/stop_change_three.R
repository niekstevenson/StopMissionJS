define_stop_change_three <- function() {
  list(
    orientation_keys = c("left_shift", "left_inner"),
    fill_keys = character(0),
    use_fill_dimension = FALSE,
    stop_rules = data.frame(
      stop_rule = "change",
      signal = "blue",
      outcome = "fixed_key",
      key = "right_shift",
      weight = 1,
      requires_signal = TRUE,
      stringsAsFactors = FALSE
    )
  )
}
