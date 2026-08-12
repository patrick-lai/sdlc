package com.example.taskboard;

/**
 * Domain model for the Task Board dummy app.
 * UI under public/ mirrors this contract.
 */
public final class Task {
  private final String id;
  private final String title;
  private final Priority priority;
  private boolean completed;

  public enum Priority {
    LOW,
    MEDIUM,
    HIGH
  }

  public Task(String id, String title, Priority priority) {
    this.id = id;
    this.title = title;
    this.priority = priority;
    this.completed = false;
  }

  public String getId() {
    return id;
  }

  public String getTitle() {
    return title;
  }

  public Priority getPriority() {
    return priority;
  }

  public boolean isCompleted() {
    return completed;
  }

  public void markComplete() {
    this.completed = true;
  }

  public void markActive() {
    this.completed = false;
  }
}
