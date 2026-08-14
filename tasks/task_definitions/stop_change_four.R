define_stop_change_four <- function() {
  list(
    orientation_keys = c("left_shift", "left_inner"),
    fill_keys = c("right_inner", "right_shift"),
    use_fill_dimension = TRUE,
    stop_rules = data.frame(
      stop_rule = "fill_change",
      signal = "blue",
      outcome = "fill_key",
      key = "",
      weight = 1,
      requires_signal = TRUE,
      stringsAsFactors = FALSE
    )
  )
}
