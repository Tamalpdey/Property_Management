rootProject.name = "lorne-platform"

include("lorne-common")
include("lorne-modulith")

project(":lorne-common").projectDir = file("modules/lorne-common")
project(":lorne-modulith").projectDir = file("modules/lorne-modulith")
