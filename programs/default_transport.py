def run(program):
    object_count = 4

    program.ensure_api_mode()
    program.set_stack_capacity(max(4, object_count))
    program.randomize_warehouses(count_per_side=18)
    program.load_io_from_rack("left", object_count)
    program.route_many_from_left_to_right(object_count)
    program.unload_io_to_rack("right", object_count)
    program.log("Program completed successfully.")
