package com.example.taskboard;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * In-memory task board service (mirrors public/app.js).
 */
public class TaskBoardService {
  private final List<Task> tasks = new ArrayList<>();

  public Task addTask(String title, Task.Priority priority) {
    if (title == null || title.isBlank()) {
      throw new IllegalArgumentException("title required");
    }
    Task task = new Task(UUID.randomUUID().toString(), title.trim(), priority);
    tasks.add(task);
    return task;
  }

  public void complete(String id) {
    find(id).markComplete();
  }

  public List<Task> list(Filter filter) {
    return tasks.stream()
        .filter(
            t ->
                switch (filter) {
                  case ALL -> true;
                  case ACTIVE -> !t.isCompleted();
                  case COMPLETED -> t.isCompleted();
                })
        .collect(Collectors.toList());
  }

  public List<Task> all() {
    return Collections.unmodifiableList(tasks);
  }

  private Task find(String id) {
    return tasks.stream()
        .filter(t -> t.getId().equals(id))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("unknown task: " + id));
  }

  public enum Filter {
    ALL,
    ACTIVE,
    COMPLETED
  }
}
