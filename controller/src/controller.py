from multiprocessing import Process, Event, set_start_method
import pygame
import time
import webview


class Main:

    def __init__(self):
        set_start_method("spawn")

        stop_event = Event()

        p1 = Process(target=self.run_controller, args=(stop_event,))
        p1.start()

        self.run_camera()

        stop_event.set()
        p1.join()
        print("All processes finished.")

    def run_controller(self, stop_event: Event):
        pygame.init()
        pygame.joystick.init()

        if pygame.joystick.get_count() == 0:
            print("Controller not found")
            pygame.quit()
            return

        joystick = pygame.joystick.Joystick(0)
        joystick.init()
        print(f"Controller detected: {joystick.get_name()}")

        try:
            while not stop_event.is_set():
                pygame.event.pump()
                axes = [joystick.get_axis(i) for i in range(joystick.get_numaxes())]
                buttons = [joystick.get_button(i) for i in range(joystick.get_numbuttons())]
                hats = [joystick.get_hat(i) for i in range(joystick.get_numhats())]

                print(
                    "\rEjes:", ["{:+.2f}".format(a) for a in axes],
                    " Botones:", buttons,
                    " Hats:", hats,
                    end=""
                )
                time.sleep(0.05)

        except KeyboardInterrupt:
            print("\nController interrupted")

        finally:
            joystick.quit()
            pygame.quit()
            print("\nController process finished")


    def run_camera(self):
        webview.create_window("Papaya Pathfinder", "http://192.168.1.131/")
        webview.start()


if __name__ == "__main__":
    Main()
